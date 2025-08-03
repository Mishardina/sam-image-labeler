document.addEventListener('DOMContentLoaded', () => {
    const imageLoader = document.getElementById('image-loader');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    const predictButton = document.getElementById('predict-button');
    const clearPointsButton = document.getElementById('clear-points-button');
    const saveMaskButton = document.getElementById('save-mask-button');
    const classSelect = document.getElementById('class-select');
    const masksListContainer = document.getElementById('masks-list');

    let originalImage = null;
    let image_data_b64 = null;
    let points = [];
    let currentMask = null; // Хранит последнюю сгенерированную маску
    let savedMasks = [];   // Хранит все сохраненные маски

    // Загрузка и отображение изображения
    imageLoader.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            originalImage = new Image();
            originalImage.onload = () => {
                canvas.width = originalImage.width;
                canvas.height = originalImage.height;
                image_data_b64 = event.target.result;
                resetState();
                redrawCanvas();
                predictButton.disabled = false;
                clearPointsButton.disabled = false;
            };
            originalImage.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Рисование точек на холсте
    canvas.addEventListener('mousedown', (e) => {
        if (!originalImage) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const label = e.button === 0 ? 1 : 0; // 0 - ЛКМ (позитивная), 2 - ПКМ (негативная)

        points.push({ x: Math.round(x), y: Math.round(y), label });
        redrawCanvas();
    });

    // Запрет контекстного меню на ПКМ
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Кнопка "Сделать маску"
    predictButton.addEventListener('click', async () => {
        if (points.length === 0) {
            alert("Пожалуйста, отметьте хотя бы одну точку на изображении.");
            return;
        }

        predictButton.disabled = true;
        predictButton.textContent = 'Обработка...';

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_data: image_data_b64,
                    points: points, // Отправляем текущие точки
                }),
            });

            if (!response.ok) throw new Error(`Ошибка сервера: ${response.statusText}`);

            const data = await response.json();
            currentMask = new Image();
            currentMask.src = data.mask;
            currentMask.onload = () => {
                points = []; // <<<--- ИЗМЕНЕНИЕ: Очищаем массив точек
                redrawCanvas(); // Перерисовываем холст. Маска появится, а точки исчезнут.
                saveMaskButton.disabled = false;
            };

        } catch (error) {
            console.error("Ошибка при запросе маски:", error);
            alert("Не удалось получить маску. Попробуйте снова.");
        } finally {
            predictButton.disabled = false;
            predictButton.textContent = 'Сделать маску';
        }
    });
    
    // Кнопка "Сохранить маску"
    saveMaskButton.addEventListener('click', () => {
        if (!currentMask) return;
        
        const maskData = {
            maskImage: currentMask,
            className: classSelect.value
        };
        savedMasks.push(maskData);
        
        // Сбрасываем текущее состояние для новой маски
        currentMask = null;
        points = [];
        saveMaskButton.disabled = true;
        
        redrawCanvas();
        updateMasksList();
    });

    // Кнопка "Очистить точки"
    clearPointsButton.addEventListener('click', () => {
        points = [];
        currentMask = null; // Также убираем не сохраненную маску
        saveMaskButton.disabled = true;
        redrawCanvas();
    });
    
    function resetState() {
        points = [];
        currentMask = null;
        savedMasks = [];
        saveMaskButton.disabled = true;
        updateMasksList();
    }

    // --- ОСНОВНАЯ ФУНКЦИЯ ПЕРЕРИСОВКИ ---
    function redrawCanvas() {
        if (!originalImage) return;

        // 1. Очищаем холст
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 2. Рисуем исходное изображение
        ctx.drawImage(originalImage, 0, 0);
        
        // 3. Рисуем все СОХРАНЕННЫЕ маски
        savedMasks.forEach(maskData => {
            ctx.drawImage(maskData.maskImage, 0, 0);
        });

        // 4. Рисуем ТЕКУЩУЮ (еще не сохраненную) маску
        if (currentMask) {
            ctx.drawImage(currentMask, 0, 0);
        }

        // 5. Рисуем все точки поверх всего
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = p.label === 1 ? 'green' : 'red';
            ctx.fill();
        });
    }
    
    function updateMasksList() {
        masksListContainer.innerHTML = '';
        if (savedMasks.length === 0) {
            masksListContainer.innerHTML = '<p>Здесь будут ваши маски.</p>';
            return;
        }
        
        const ul = document.createElement('ul');
        savedMasks.forEach((maskData, index) => {
            const li = document.createElement('li');
            li.textContent = `Маска ${index + 1}: Класс "${maskData.className}"`;
            ul.appendChild(li);
        });
        masksListContainer.appendChild(ul);
    }
});