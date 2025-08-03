import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import AnnotationCanvas from './components/AnnotationCanvas';
import Controls from './components/Controls';

const API_URL = 'http://127.0.0.1:5000';

function App() {
  // Объявление всех состояний
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [classes, setClasses] = useState(['car', 'person', 'road']);
  const [activeClass, setActiveClass] = useState('car');
  const [annotations, setAnnotations] = useState([]);
  const [proposedMasks, setProposedMasks] = useState([]);
  const [points, setPoints] = useState([]);
  const [error, setError] = useState('');

  // Обработчик выбора файлов
  const handleFileChange = (event) => {
    const files = Array.from(event.target.files).map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setUploadedFiles(files);
    setError('');
    setSelectedImage(null);
    setAnnotations([]);
    setProposedMasks([]);
    setPoints([]);
  };

  // Обработчик выбора изображения из галереи
  const handleImageSelect = (image) => {
    setSelectedImage(image);
    setAnnotations([]);
    setProposedMasks([]);
    setPoints([]);
  };

  // Функция добавления подтвержденной маски в список аннотаций
  const addAnnotation = (mask) => {
    const newAnnotation = {
      id: Date.now(),
      maskData: mask,
      className: activeClass,
    };
    setAnnotations([...annotations, newAnnotation]);
    setProposedMasks([]);
    setPoints([]);
  };
  
  // Функция запроса предсказания у бэкенда
  const handlePredict = async () => {
    if (!selectedImage || points.length === 0) {
        alert("Пожалуйста, выберите изображение и поставьте хотя бы одну точку.");
        return;
    }
    setError('');

    const formData = new FormData();
    formData.append('image', selectedImage.file);

    // В FastAPI с Pydantic и файлами удобнее передавать структурированные данные как JSON-строку
    formData.append('points_json', JSON.stringify({ points: points }));

    try {
        const response = await axios.post(`${API_URL}/predict`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        setProposedMasks(response.data.masks);
    } catch (err) {
        console.error("Ошибка при предсказании:", err);
        setError("Ошибка предсказания. Проверьте консоль бэкенда.");
    }
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>SAM Annotator 🤖</h1>
      </header>
      <main className="App-main">
        <div className="gallery-container">
          <h2>Галерея</h2>
          <div className="upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              📤 Загрузить изображения
            </label>
            <input
              id="file-upload"
              type="file"
              multiple
              accept="image/png, image/jpeg"
              onChange={handleFileChange}
            />
          </div>
          <div className="image-list">
            {uploadedFiles.map((image, index) => (
              <div
                key={index}
                className={`gallery-item ${selectedImage?.file.name === image.file.name ? 'selected' : ''}`}
                onClick={() => handleImageSelect(image)}
              >
                <img src={image.preview} alt={image.file.name} width="50" height="50" />
                <span>{image.file.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="canvas-container">
          {selectedImage ? (
            <AnnotationCanvas
              imageFile={selectedImage}
              annotations={annotations}
              proposedMasks={proposedMasks}
              onMaskSelect={addAnnotation}
              points={points}
              setPoints={setPoints}
            />
          ) : (
            <div className="placeholder">
              <p>Выберите изображение из галереи для начала работы</p>
            </div>
          )}
        </div>
        <div className="controls-container">
          <Controls
            classes={classes}
            setClasses={setClasses}
            activeClass={activeClass}
            setActiveClass={setActiveClass}
            onPredict={handlePredict}
            onClear={() => setPoints([])}
          />
        </div>
      </main>
      {error && <p className="error-message" style={{position: 'fixed', bottom: '10px', left: '10px', background: 'red', color: 'white', padding: '10px', borderRadius: '5px'}}>{error}</p>}
    </div>
  );
}

export default App;