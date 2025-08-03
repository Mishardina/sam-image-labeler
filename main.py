import base64
import io
import json
from typing import List
from PIL import Image
import cv2
import numpy as np
import torch
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from transformers import SamModel, SamProcessor


# --- Pydantic модели (обновляем) ---
class Point(BaseModel):
    x: int
    y: int
    label: int

class PredictRequestData(BaseModel):
    points: List[Point]

class MaskData(BaseModel):
    mask_b64: str
    score: float

class PredictResponse(BaseModel):
    masks: List[MaskData]

model_cache = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Загружаем модель и процессор из Hugging Face Hub
    print("Загрузка модели и процессора SAM из Hugging Face...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    # Модель будет скачана и закеширована автоматически
    model = SamModel.from_pretrained("facebook/sam-vit-huge").to(device)
    processor = SamProcessor.from_pretrained("facebook/sam-vit-huge")
    
    model_cache["model"] = model
    model_cache["processor"] = processor
    model_cache["device"] = device
    
    print("Модель и процессор SAM успешно загружены!")
    
    yield
    
    print("Очистка ресурсов...")
    model_cache.clear()

# --- Инициализация FastAPI ---

app = FastAPI(lifespan=lifespan)

origins = [
    "http://localhost:5173", # Адрес по умолчанию для Vite
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Разрешаем все методы (GET, POST, etc.)
    allow_headers=["*"], # Разрешаем все заголовки
)


# --- Вспомогательная функция (остается без изменений) ---

def mask_to_polygon(mask):
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []
    all_points = np.concatenate(contours, axis=0)
    return all_points.flatten().tolist()

@app.post("/predict", response_model=PredictResponse, tags=["Annotation"])
async def predict_mask(
    image: UploadFile = File(...),
    points_json: str = Form(...)
):
    # ↓↓↓ ДОБАВЬТЕ ЭТУ СТРОКУ ↓↓↓
    print(f"ПОЛУЧЕНА JSON-СТРОКА С ТОЧКАМИ: {points_json}")

    model = model_cache.get("model")
    processor = model_cache.get("processor")
    device = model_cache.get("device")

    if not all([model, processor, device]):
        raise HTTPException(status_code=503, detail="Модель не загружена")

    try:
        data = json.loads(points_json)
        request_data = PredictRequestData(**data)
    except (json.JSONDecodeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=f"Неверный формат точек: {e}")

    # --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
    # Преобразуем точки в список списков float, как того требует `transformers`
    input_points = [[[float(p.x), float(p.y)] for p in request_data.points]]
    input_labels = [[p.label for p in request_data.points]]
    # --- КОНЕЦ ИСПРАВЛЕНИЯ ---


    contents = await image.read()
    raw_image = Image.open(io.BytesIO(contents)).convert("RGB")

    inputs = processor(
        raw_image,
        input_points=input_points,
        input_labels=input_labels,
        return_tensors="pt"
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs, multimask_output=True)

    # ... (остальной код пост-обработки масок и кодирования в Base64 остается без изменений) ...
    masks = processor.image_processor.post_process_masks(
        outputs.pred_masks.cpu(),
        inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu()
    )
    masks = masks[0]
    scores = outputs.iou_scores.cpu().squeeze()
    if len(masks.shape) == 4:
        masks = masks.squeeze()

    response_masks = []
    for mask, score in zip(masks, scores):
        binary_mask = (mask.numpy().squeeze() * 255).astype(np.uint8)
        if binary_mask.size == 0:
            continue
        _, buffer = cv2.imencode('.png', binary_mask)
        mask_b64 = base64.b64encode(buffer).decode('utf-8')
        response_masks.append(MaskData(mask_b64=mask_b64, score=score.item()))
    
    response_masks.sort(key=lambda m: m.score, reverse=True)
    return PredictResponse(masks=response_masks)