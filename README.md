# SAM Annotation Tool

A web-based, semi-automatic image annotation tool for segmentation tasks, powered by the Segment Anything Model (SAM) from Meta AI. This application allows users to interactively create precise segmentation masks by placing positive and negative points on an image. It is designed to streamline the process of creating datasets for computer vision models.

The application is built with a **FastAPI** backend and a vanilla **JavaScript** frontend, containerized with **Docker** for easy and reliable deployment.

## ✨ Features

  * **Multi-Image Workflow**: Upload and annotate multiple images in a single session.
  * **Interactive Segmentation**: Place positive (LMB) and negative (RMB) points to generate masks in real-time.
  * **Dynamic Mask Refinement**: Add more points to iteratively refine the segmentation mask.
  * **Custom Class Management**: Create your own classes with custom names and colors for masks.
  * **Multi-Language Support**: Switch between English (EN) and Russian (RU) interfaces.
  * **Interactive Mask Highlighting**: Click on a saved mask in the list to highlight it on the canvas.
  * **Dataset Export**: Export your annotations and images in a single ZIP archive, with labels in **YOLO** and **COCO** formats.
  * **Dockerized**: Easy setup and deployment using Docker and Docker Compose.

-----

## 🚀 Getting Started

You can run the application locally using Python's virtual environment or via Docker (recommended for simplicity and consistency).

### Prerequisites

  * [Git](https://git-scm.com/)
  * [Python 3.9+](https://www.python.org/)
  * [Docker](https://www.docker.com/products/docker-desktop/) & [Docker Compose](https://docs.docker.com/compose/install/)

### 1\. Running with Docker Compose (Recommended)

This is the easiest and most reliable way to run the application. It automatically handles dependencies, networking, and model caching.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/Mishardina/sam-image-labeler.git
    cd sam-image-labeler
    ```

2.  **Build and run the container:**

    ```bash
    docker-compose up --build
    ```

    The first launch might take some time as it will download the base Python image, install dependencies, and download the SAM model from Hugging Face. The model will be cached in a Docker volume, so subsequent launches will be much faster.

3.  **Access the application:**
    Open your web browser and navigate to `http://localhost:8000`.

To stop the application, press `Ctrl + C` in the terminal.

### 2\. Running with Docker Engine

If you prefer not to use Docker Compose, you can build and run the container manually.

1.  **Clone the repository** (if you haven't already).

2.  **Build the Docker image:**

    ```bash
    docker build -t sam-annotation-tool .
    ```

3.  **Run the Docker container:**

    ```bash
    docker run -p 8000:8000 --name sam_labeler_app sam-annotation-tool
    ```

    *Note: This method does not use a persistent volume for model caching. The model will be re-downloaded if you remove and recreate the container.*

### 3\. Running Locally (from Console)

1.  **Clone the repository** (if you haven't already).

2.  **Create and activate a virtual environment:**

    ```bash
    # For macOS/Linux
    python3 -m venv venv
    source venv/bin/activate

    # For Windows
    python -m venv venv
    .\venv\Scripts\activate
    ```

3.  **Install dependencies:**

    ```bash
    pip install -r requirements.txt
    ```

4.  **Run the application:**
    The application uses Uvicorn, a lightning-fast ASGI server.

    ```bash
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    ```

    The `--reload` flag enables auto-reloading when you make changes to the code.

5.  **Access the application:**
    Open your web browser and navigate to `http://localhost:8000`.

-----

## 🖼️ Usage Example

Here is a quick overview of the annotation workflow.

### 1\. Upload Images and Create Classes

Upload one or more images using the "Upload Images" button. Create the classes you need for your dataset, choosing a unique name and color for each.

### 2\. Annotate an Image

Select an image from the left panel. Click on the image to place points:

  * **Left Mouse Button**: Adds a positive point (part of the object).
  * **Right Mouse Button**: Adds a negative point (part of the background).

The mask will update automatically after each click. Add more points to refine the mask until it accurately covers the object.

![alt text](image.png)
![alt text](image-1.png)

### 3\. Save the Mask and Export

Once you are satisfied with the mask, select the appropriate class and click "Save Mask". The mask will be added to the list for the current image. You can highlight any saved mask by clicking on it in the list.

When you have finished annotating, click "Export to ZIP" to download a zip archive containing all your images and the corresponding labels in COCO and YOLO formats.

-----

## 📝 Future Work & TODO

Here is a list of potential improvements and features planned for the future. Contributions are welcome\!

  - [ ] **GPU Support**: Add support for GPU-enabled Docker containers to accelerate model inference.
  - [ ] **CPU Acceleration**: Add popular CPU runtimes (ONNX, OpenVINO etc.) support to improve inference time.
  - [ ] **Bounding Box Export**: Implement annotation export for bounding boxes in YOLO and COCO formats.
  - [ ] **GroundingDINO Integration**: Experiment with integrating GroundingDINO for zero-shot object detection to suggest initial points.
  - [ ] **Frontend Refactor**: Explore migrating the frontend to a modern framework like React for better state management and component structure.