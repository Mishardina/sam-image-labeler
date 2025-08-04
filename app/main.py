import base64
import io
import json
import zipfile
from datetime import datetime
from typing import List

import cv2
import numpy as np
import torch
import yaml
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from PIL import Image
from transformers import SamModel, SamProcessor

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

device = "cuda" if torch.cuda.is_available() else "cpu"
model = SamModel.from_pretrained("facebook/sam-vit-huge").to(device)
processor = SamProcessor.from_pretrained("facebook/sam-vit-huge")


class Point(BaseModel):
    x: int
    y: int
    label: int

class MaskRequest(BaseModel):
    image_data: str
    points: List[Point]

class SavedMask(BaseModel):
    maskImage: str
    className: str
    classColor: str

class ImageState(BaseModel):
    imageDataUrl: str
    savedMasks: List[SavedMask]

class ClassInfo(BaseModel):
    name: str
    color: str

class ExportRequest(BaseModel):
    imagesState: List[ImageState]
    classes: List[ClassInfo]


def get_image_from_base64(base64_str: str) -> Image.Image:
    """
    Decodes a base64 string into a PIL Image object.

    Args:
        base64_str: The base64 encoded image string.

    Returns:
        A PIL.Image.Image object.
    """
    if "," in base64_str:
        base64_str = base64_str.split(',')[1]
    image_data = base64.b64decode(base64_str)
    return Image.open(io.BytesIO(image_data))

def base64_to_cv2(base64_str: str) -> np.ndarray:
    """
    Converts a base64 string to a NumPy array (OpenCV image).

    Args:
        base64_str: The base64 encoded image string.

    Returns:
        A NumPy array in BGRA format.
    """
    img = get_image_from_base64(base64_str).convert("RGBA")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGBA2BGRA)


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """
    Serves the main HTML page of the application.

    Args:
        request: The FastAPI request object.

    Returns:
        An HTMLResponse with the rendered template.
    """
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/predict")
async def predict_mask(request: MaskRequest):
    """
    Accepts an image and points, and returns a predicted mask.

    Uses the SAM model to generate multiple masks and returns the one
    with the highest IoU score.

    Args:
        request: The request body containing the image and a list of points.

    Returns:
        A JSONResponse with the mask as a base64 encoded PNG with an alpha channel.
    """
    try:
        image = get_image_from_base64(request.image_data).convert("RGB")
        input_points = [[[p.x, p.y] for p in request.points]]
        input_labels = [[p.label for p in request.points]]
        inputs = processor(image, input_points=input_points, input_labels=input_labels, return_tensors="pt").to(device)
        
        with torch.no_grad():
            outputs = model(**inputs)

        masks = processor.image_processor.post_process_masks(
            outputs.pred_masks.cpu(), inputs["original_sizes"].cpu(), inputs["reshaped_input_sizes"].cpu()
        )[0]
        
        best_mask_idx = torch.argmax(outputs.iou_scores.cpu()).item()
        best_mask = masks[0, best_mask_idx]

        alpha_mask = (best_mask.numpy() * 255).astype(np.uint8)
        mask_image = Image.new("RGBA", (best_mask.shape[1], best_mask.shape[0]), (0, 0, 0, 0))
        mask_image.putalpha(Image.fromarray(alpha_mask))

        buffered = io.BytesIO()
        mask_image.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

        return JSONResponse(content={"mask": f"data:image/png;base64,{img_str}"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@app.post("/export")
async def export_dataset(request: ExportRequest):
    """
    Accepts the full annotation state and exports it to a zip archive.

    Generates annotations in COCO and YOLO formats, packages them with
    the original images into a zip archive, and returns it for download.

    Args:
        request: The request body containing the states of all images and classes.

    Returns:
        A StreamingResponse with the zip archive.
    """
    class_map = {c.name: i for i, c in enumerate(request.classes)}
    
    yolo_labels = {}
    for i, img_state in enumerate(request.imagesState):
        img_h, img_w = base64_to_cv2(img_state.imageDataUrl).shape[:2]
        yolo_content = []
        for mask_data in img_state.savedMasks:
            class_id = class_map[mask_data.className]
            mask_cv = base64_to_cv2(mask_data.maskImage)
            gray_mask = mask_cv[:, :, 3]
            contours, _ = cv2.findContours(gray_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours: continue
            
            contour = max(contours, key=cv2.contourArea)
            contour_normalized = contour.flatten().astype(float)
            contour_normalized[0::2] /= img_w
            contour_normalized[1::2] /= img_h
            
            yolo_content.append(f"{class_id} " + " ".join(map(str, contour_normalized)))
        
        if yolo_content:
            yolo_labels[f"image_{i}.txt"] = "\n".join(yolo_content)

    coco_data = {
        "info": {"description": "Dataset exported from SAM-Labeler", "date_created": datetime.now().isoformat()},
        "licenses": [],
        "images": [],
        "annotations": [],
        "categories": [{"id": i, "name": name, "supercategory": "object"} for name, i in class_map.items()]
    }
    ann_id_counter = 0
    for img_id, img_state in enumerate(request.imagesState):
        img_h, img_w = base64_to_cv2(img_state.imageDataUrl).shape[:2]
        coco_data["images"].append({"id": img_id, "width": img_w, "height": img_h, "file_name": f"image_{img_id}.png"})

        for mask_data in img_state.savedMasks:
            class_id = class_map[mask_data.className]
            mask_cv = base64_to_cv2(mask_data.maskImage)
            gray_mask = mask_cv[:, :, 3]
            contours, _ = cv2.findContours(gray_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours: continue

            segmentations = [c.flatten().tolist() for c in contours]
            
            x, y, w, h = cv2.boundingRect(contours[0])
            area = cv2.contourArea(contours[0])

            coco_data["annotations"].append({
                "id": ann_id_counter,
                "image_id": img_id,
                "category_id": class_id,
                "segmentation": segmentations,
                "area": float(area),
                "bbox": [x, y, w, h],
                "iscrowd": 0
            })
            ann_id_counter += 1

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        for i, img_state in enumerate(request.imagesState):
            img_data = base64.b64decode(img_state.imageDataUrl.split(',')[1])
            zip_file.writestr(f"images/image_{i}.png", img_data)
        
        for name, content in yolo_labels.items():
            zip_file.writestr(f"labels/yolo/{name}", content)
        data_yaml = yaml.dump({"names": list(class_map.keys()), "nc": len(class_map)})
        zip_file.writestr("labels/yolo/data.yaml", data_yaml)
        
        zip_file.writestr("labels/coco/annotations.json", json.dumps(coco_data, indent=2))

    zip_buffer.seek(0)
    return StreamingResponse(zip_buffer, media_type="application/x-zip-compressed", headers={"Content-Disposition": "attachment; filename=dataset.zip"})