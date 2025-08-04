document.addEventListener('DOMContentLoaded', async () => {
    const langSwitcher = document.getElementById('lang-switcher');
    const imageLoader = document.getElementById('image-loader');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const canvasPlaceholder = document.getElementById('canvas-placeholder');
    const clearPointsButton = document.getElementById('clear-points-button');
    const saveMaskButton = document.getElementById('save-mask-button');
    const masksListContainer = document.getElementById('masks-list-container');
    const newClassInput = document.getElementById('new-class-input');
    const newClassColor = document.getElementById('new-class-color');
    const addClassButton = document.getElementById('add-class-button');
    const classListContainer = document.getElementById('class-list-container');
    const imageThumbnailList = document.getElementById('image-thumbnail-list');
    const exportButton = document.getElementById('export-button');

    let imagesState = [];
    let activeImageId = null;
    let classes = [];
    let activeClass = null;
    let isPredicting = false;
    let translations = {};

    /**
     * Loads the JSON translation file for the specified language.
     * @param {string} lang - The language code (e.g., 'en' or 'ru').
     */
    const loadTranslations = async (lang) => {
        try {
            const response = await fetch(`/static/locales/${lang}.json`);
            if (!response.ok) throw new Error(`Could not load ${lang}.json`);
            translations = await response.json();
        } catch (error) {
            console.error(error);
            const response = await fetch(`/static/locales/en.json`);
            translations = await response.json();
        }
    };

    /**
     * Applies the loaded translations to all UI elements.
     */
    const applyTranslations = () => {
        document.querySelectorAll('[data-i18n]').forEach(elem => {
            const key = elem.getAttribute('data-i18n');
            elem.innerHTML = translations[key] || elem.innerHTML;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
            const key = elem.getAttribute('data-i18n-placeholder');
            elem.placeholder = translations[key] || elem.placeholder;
        });
        updateAllUI();
    };

    /**
     * Sets the application language, loads and applies translations.
     * @param {string} lang - The language code to set.
     */
    const setLanguage = async (lang) => {
        await loadTranslations(lang);
        document.documentElement.lang = lang;
        applyTranslations();
        langSwitcher.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    };

    langSwitcher.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const lang = e.target.dataset.lang;
            if (lang) setLanguage(lang);
        }
    });

    /**
     * @returns {object|null} The state object for the currently active image.
     */
    const getActiveImageState = () => activeImageId !== null ? imagesState[activeImageId] : null;

    /**
     * Finds class information by its name.
     * @param {string} name - The name of the class.
     * @returns {object|undefined} The class object or undefined if not found.
     */
    const findClassByName = (name) => classes.find(c => c.name === name);

    imageLoader.addEventListener('change', (e) => {
        const files = e.target.files;
        if (!files.length) return;
        const fileReadPromises = Array.from(files).map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        imagesState.push({
                            imageElement: img,
                            imageDataUrl: event.target.result,
                            points: [],
                            currentMask: null,
                            savedMasks: [],
                            highlightedMaskIndex: null
                        });
                        resolve();
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            });
        });
        Promise.all(fileReadPromises).then(() => {
            if (activeImageId === null && imagesState.length > 0) setActiveImage(0);
            else renderThumbnails();
        });
    });

    canvas.addEventListener('mousedown', (e) => {
        const state = getActiveImageState();
        if (!state || isPredicting) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        const label = e.button === 0 ? 1 : 0;
        state.points.push({ x: Math.round(x), y: Math.round(y), label });
        redrawCanvas();
        generateMask();
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    saveMaskButton.addEventListener('click', () => {
        const state = getActiveImageState();
        if (!state || !state.currentMask || !activeClass) return;
        const classInfo = findClassByName(activeClass);
        state.savedMasks.push({
            maskImageObject: state.currentMask,
            maskImageSrc: state.currentMask.src,
            className: classInfo.name,
            classColor: classInfo.color,
        });
        state.currentMask = null;
        state.points = [];
        updateAllUI();
    });

    clearPointsButton.addEventListener('click', () => {
        const state = getActiveImageState();
        if (!state) return;
        if (state.points.length > 0 || state.currentMask) {
            state.points = [];
            state.currentMask = null;
            updateAllUI();
        }
    });

    addClassButton.addEventListener('click', () => {
        const className = newClassInput.value.trim();
        if (className && !findClassByName(className)) {
            classes.push({ name: className, color: newClassColor.value });
            newClassInput.value = '';
            renderClassesUI();
            setActiveClass(className);
        } else if (findClassByName(className)) {
            alert(translations.alertClassExists);
        }
    });

    exportButton.addEventListener('click', async () => {
        if (imagesState.length === 0) {
            alert(translations.alertNoImagesToExport);
            return;
        }
        exportButton.disabled = true;
        exportButton.textContent = translations.exportingButton;
        try {
            const payload = {
                imagesState: imagesState.map(s => ({
                    imageDataUrl: s.imageDataUrl,
                    savedMasks: s.savedMasks.map(m => ({
                        maskImage: m.maskImageSrc,
                        className: m.className,
                        classColor: m.classColor
                    }))
                })),
                classes: classes
            };
            const response = await fetch('/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'dataset.zip';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (error) {
            console.error("Export Error:", error);
            alert(translations.alertExportError);
        } finally {
            exportButton.disabled = false;
            exportButton.textContent = translations.exportButton;
        }
    });
    
    masksListContainer.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        const state = getActiveImageState();
        if (!state) return;
        const maskIndex = parseInt(li.dataset.maskIndex, 10);
        state.highlightedMaskIndex = (state.highlightedMaskIndex === maskIndex) ? null : maskIndex;
        renderMasksListUI();
        redrawCanvas();
    });

    /**
     * Makes an image active for annotation.
     * @param {number} imageId - The index of the image in the `imagesState` array.
     */
    function setActiveImage(imageId) {
        activeImageId = imageId;
        updateAllUI();
    }

    /**
     * Sends a request to the backend to generate a mask and updates the UI.
     */
    async function generateMask() {
        const state = getActiveImageState();
        if (!state || state.points.length === 0) return;
        isPredicting = true;
        try {
            const response = await fetch('/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_data: state.imageDataUrl, points: state.points }) });
            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
            const data = await response.json();
            const color = activeClass ? findClassByName(activeClass).color : '#FF0000';
            createColoredMask(data.mask, color).then(coloredMask => {
                 state.currentMask = coloredMask;
                 updateAllUI();
            });
        } catch (error) {
            console.error("Mask request failed:", error);
        } finally {
            isPredicting = false;
        }
    }

    /**
     * Colors a monochrome mask with a given color and transparency.
     * @param {string} maskBase64 - The base64 encoded mask with an alpha channel.
     * @param {string} hexColor - The color in HEX format (e.g., '#FF0000').
     * @returns {Promise<Image>} A Promise that resolves to the colored Image object.
     */
    function createColoredMask(maskBase64, hexColor) {
        return new Promise((resolve) => {
            const maskImage = new Image();
            maskImage.src = maskBase64;
            maskImage.onload = () => {
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = maskImage.width;
                tempCanvas.height = maskImage.height;
                const r = parseInt(hexColor.slice(1, 3), 16), g = parseInt(hexColor.slice(3, 5), 16), b = parseInt(hexColor.slice(5, 7), 16);
                tempCtx.drawImage(maskImage, 0, 0);
                const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] > 0) {
                        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 128;
                    }
                }
                tempCtx.putImageData(imageData, 0, 0);
                const finalMask = new Image();
                finalMask.src = tempCanvas.toDataURL();
                finalMask.onload = () => resolve(finalMask);
            };
        });
    }

    /**
     * Calls all rendering functions to completely update the UI.
     */
    function updateAllUI() {
        const state = getActiveImageState();
        if(state) {
            canvas.width = state.imageElement.width;
            canvas.height = state.imageElement.height;
        }
        redrawCanvas();
        renderThumbnails();
        renderClassesUI();
        renderMasksListUI();
        updateButtonsState();
    }

    /**
     * Redraws the main canvas with the image, masks, and points.
     */
    function redrawCanvas() {
        const state = getActiveImageState();
        if (!state) {
            canvas.style.display = 'none';
            canvasPlaceholder.style.display = 'flex';
            return;
        }
        canvas.style.display = 'block';
        canvasPlaceholder.style.display = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(state.imageElement, 0, 0);

        state.savedMasks.forEach((maskData, index) => {
            ctx.globalAlpha = (index === state.highlightedMaskIndex) ? 0.9 : 0.5;
            ctx.drawImage(maskData.maskImageObject, 0, 0);
        });
        
        ctx.globalAlpha = 1.0;
        if (state.currentMask) ctx.drawImage(state.currentMask, 0, 0);
        state.points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = p.label === 1 ? 'green' : 'red';
            ctx.fill();
        });
    }

    /**
     * Renders the list of uploaded image thumbnails.
     */
    function renderThumbnails() {
        imageThumbnailList.innerHTML = '';
        if (imagesState.length === 0) {
            imageThumbnailList.innerHTML = `<p data-i18n="uploadPrompt">${translations.uploadPrompt || "..."}</p>`;
            return;
        }
        imagesState.forEach((state, index) => {
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'thumbnail';
            if (index === activeImageId) thumbDiv.classList.add('active');
            thumbDiv.onclick = () => setActiveImage(index);
            const img = document.createElement('img');
            img.src = state.imageDataUrl;
            thumbDiv.appendChild(img);
            if (state.savedMasks.length > 0) {
                const count = document.createElement('div');
                count.className = 'mask-count';
                count.textContent = state.savedMasks.length;
                thumbDiv.appendChild(count);
            }
            imageThumbnailList.appendChild(thumbDiv);
        });
    }

    /**
     * Renders the list of user-created classes.
     */
    function renderClassesUI() {
        classListContainer.innerHTML = '';
        if (classes.length === 0) {
            classListContainer.innerHTML = `<p data-i18n="addClassesPrompt">${translations.addClassesPrompt || "..."}</p>`;
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'class-list';
        classes.forEach(classInfo => {
            const li = document.createElement('li');
            if (classInfo.name === activeClass) li.classList.add('active');
            li.addEventListener('click', () => setActiveClass(classInfo.name));
            const colorDot = document.createElement('div');
            colorDot.className = 'color-dot';
            colorDot.style.backgroundColor = classInfo.color;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = classInfo.name;
            li.appendChild(colorDot);
            li.appendChild(nameSpan);
            ul.appendChild(li);
        });
        classListContainer.appendChild(ul);
    }

    /**
     * Sets the active class for annotation.
     * @param {string} className - The name of the class to make active.
     */
    function setActiveClass(className) {
        activeClass = className;
        renderClassesUI();
        updateButtonsState();
    }

    /**
     * Renders the list of saved masks for the current image.
     */
    function renderMasksListUI() {
        masksListContainer.innerHTML = '';
        const state = getActiveImageState();
        if (!state || state.savedMasks.length === 0) {
            masksListContainer.innerHTML = `<p data-i18n="noMasksPrompt">${translations.noMasksPrompt || "..."}</p>`;
            return;
        }
        const ul = document.createElement('ul');
        state.savedMasks.forEach((maskData, index) => {
            const li = document.createElement('li');
            li.dataset.maskIndex = index;
            if (index === state.highlightedMaskIndex) li.classList.add('highlighted-mask');
            const colorDot = document.createElement('div');
            colorDot.className = 'color-dot';
            colorDot.style.backgroundColor = maskData.classColor;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = `${translations.maskLabel || 'Mask'} ${index + 1}: ${translations.classLabel || 'Class'} "${maskData.className}"`;
            li.appendChild(colorDot);
            li.appendChild(nameSpan);
            ul.appendChild(li);
        });
        masksListContainer.appendChild(ul);
    }

    /**
     * Updates the enabled/disabled state of buttons based on the application state.
     */
    function updateButtonsState() {
        const state = getActiveImageState();
        const hasActiveImage = state !== null;
        const hasCurrentWork = hasActiveImage && (state.points.length > 0 || state.currentMask !== null);
        clearPointsButton.disabled = !hasCurrentWork;
        saveMaskButton.disabled = !(hasActiveImage && state.currentMask && activeClass);
        exportButton.disabled = imagesState.length === 0;
    }

    /**
     * Initializes the application when the page loads.
     */
    async function init() {
        const initialLang = navigator.language.startsWith('ru') ? 'ru' : 'en';
        await setLanguage(initialLang);
    }

    init();
});