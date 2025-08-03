// frontend/src/components/MaskImage.jsx

import React, { useState, useEffect } from 'react';
import { Image as KonvaImage } from 'react-konva';

const MaskImage = ({ src, ...props }) => {
  const [image, setImage] = useState(null);

  // Этот хук будет выполняться каждый раз, когда меняется src
  useEffect(() => {
    if (!src) return;

    const img = new window.Image();
    img.src = src;
    img.onload = () => {
      // Когда изображение успешно загружено, сохраняем его в состояние
      setImage(img);
    };
    img.onerror = () => {
        console.error(`Не удалось загрузить изображение: ${src}`);
    }
    // Очистка на случай, если компонент размонтируется до загрузки
    return () => {
        img.onload = null;
        img.onerror = null;
    }
  }, [src]); // Зависимость от src

  // Рендерим KonvaImage только после того, как изображение загружено
  return image ? <KonvaImage image={image} {...props} /> : null;
};

export default MaskImage;