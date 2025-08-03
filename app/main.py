from fastapi import FastAPI, File, UploadFile, Form, Request # <--- Добавлен Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from PIL import Image
import numpy as np
import torch
from transformers import SamModel, SamProcessor
import io
import base64

# Инициализация FastAPI приложения
app = FastAPI()

# Подключение статических файлов и шаблонов
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# Загрузка модели и процессора SAM
device = "cuda" if torch.cuda.is_available() else "cpu"
model = SamModel.from_pretrained("facebook/sam-vit-huge").to(device)
processor = SamProcessor.from_pretrained("facebook/sam-vit-huge")

class Point(BaseModel):
    x: int
    y: int
    label: int # 1 для положительной точки, 0 для отрицательной

class MaskRequest(BaseModel):
    image_data: str # base64 encoded image
    points: list[Point]

def get_image_from_base64(base64_str):
    """Декодирует изображение из base64."""
    if "," in base64_str:
        base64_str = base64_str.split(',')[1]
    image_data = base64.b64decode(base64_str)
    return Image.open(io.BytesIO(image_data)).convert("RGB")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Отдает главную страницу."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/predict")
async def predict_mask(request: MaskRequest):
    """
    Принимает изображение и точки, возвращает лучшую маску (по скору IoU) в формате base64.
    """
    try:
        # Получаем изображение
        image = get_image_from_base64(request.image_data)

        # Подготавливаем точки для модели
        input_points = [[[p.x, p.y] for p in request.points]]
        input_labels = [[p.label for p in request.points]]

        # Обработка изображения и точек
        inputs = processor(image, input_points=input_points, input_labels=input_labels, return_tensors="pt").to(device)
        
        # Генерация масок
        with torch.no_grad():
            outputs = model(**inputs)

        # Постобработка масок
        # `pred_masks` имеет размер [batch_size, num_masks, height, width]
        # Мы берем маску с самым высоким iou_scores
        masks = processor.image_processor.post_process_masks(
            outputs.pred_masks.cpu(), inputs["original_sizes"].cpu(), inputs["reshaped_input_sizes"].cpu()
        )[0]
        
        # Сортируем по скору и выбираем лучшую
        best_mask_idx = torch.argmax(outputs.iou_scores.cpu()).item()
        best_mask = masks[0, best_mask_idx] # (H, W)

        # Конвертируем маску в изображение RGBA
        mask_image = Image.fromarray((best_mask.numpy() * 255).astype(np.uint8))
        
        # Создаем полупрозрачное изображение для отправки на фронтенд
        # Цвет маски - красный (255, 0, 0) с 50% прозрачностью
        colored_mask = Image.new("RGBA", mask_image.size, (255, 0, 0, 0))
        colored_mask.putalpha(Image.fromarray((best_mask.numpy() * 128).astype(np.uint8)))


        # Кодируем в base64
        buffered = io.BytesIO()
        colored_mask.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

        return JSONResponse(content={"mask": f"data:image/png;base64,{img_str}"})

    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})