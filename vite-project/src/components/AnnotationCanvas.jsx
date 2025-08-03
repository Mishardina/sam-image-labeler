// frontend/src/components/AnnotationCanvas.jsx

import React, { useState, useEffect } from 'react';
import { Stage, Layer, Circle, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';

// Этот компонент должен был быть в AnnotationCanvas.jsx из-за ошибки в моем предыдущем коде.
// Давайте убедимся, что он здесь и работает правильно.
const ColoredMask = ({ src, color, onClick }) => {
    const [img] = useImage(src);
    const imageRef = React.useRef(null);

    useEffect(() => {
        if (img && imageRef.current) {
            imageRef.current.cache();
        }
    }, [img]);

    if (!img) return null;

    return (
        <KonvaImage
            ref={imageRef}
            image={img}
            filters={[Konva.Filters.RGB]}
            red={color.r}
            green={color.g}
            blue={color.b}
            opacity={0.6}
            onClick={onClick}
            onMouseEnter={e => e.target.getStage().container().style.cursor = 'pointer'}
            onMouseLeave={e => e.target.getStage().container().style.cursor = 'crosshair'}
        />
    );
};

// Основной компонент
const AnnotationCanvas = ({ imageFile, annotations, proposedMasks, onMaskSelect, points, setPoints }) => {
    const [mainImage, setMainImage] = useState(null);

    useEffect(() => {
        if (!imageFile) return;
        setMainImage(null);
        const img = new window.Image();
        img.src = imageFile.preview;
        img.onload = () => setMainImage(img);
        return () => { img.onload = null; };
    }, [imageFile]);

    const handleStageClick = (e) => {
        const point = e.target.getStage().getRelativePointerPosition();
        // --- ИСПРАВЛЕНИЕ ЗДЕСЬ: ОКРУГЛЯЕМ КООРДИНАТЫ ---
        setPoints([...points, { x: Math.round(point.x), y: Math.round(point.y), label: 1 }]);
    };

    const handleContextMenu = (e) => {
        e.evt.preventDefault();
        const point = e.target.getStage().getRelativePointerPosition();
        // --- И ИСПРАВЛЕНИЕ ЗДЕСЬ ---
        setPoints([...points, { x: Math.round(point.x), y: Math.round(point.y), label: 0 }]);
    };

    if (!mainImage) {
        return <div className="placeholder"><p>Загрузка...</p></div>;
    }

    return (
        <Stage
            width={mainImage.width}
            height={mainImage.height}
            onClick={handleStageClick}
            onContextMenu={handleContextMenu}
            style={{ cursor: 'crosshair' }}
        >
            <Layer>
                <KonvaImage image={mainImage} />

                {annotations.map(ann => (
                    <ColoredMask
                        key={ann.id}
                        src={`data:image/png;base64,${ann.maskData.mask_b64}`}
                        color={{ r: 0, g: 255, b: 0 }}
                        listening={false}
                    />
                ))}

                {proposedMasks.map((mask, i) => {
                    const color = i === 0 ? { r: 0, g: 255, b: 0 } : { r: 255, g: 165, b: 0 };
                    return (
                        <ColoredMask
                            key={i}
                            src={`data:image/png;base64,${mask.mask_b64}`}
                            color={color}
                            onClick={() => onMaskSelect(mask)}
                        />
                    );
                })}
                
                {points.map((p, i) => (
                    <Circle
                        key={i}
                        x={p.x}
                        y={p.y}
                        radius={5}
                        fill={p.label === 1 ? 'green' : 'red'}
                        stroke="white"
                        strokeWidth={1}
                        listening={false}
                    />
                ))}
            </Layer>
        </Stage>
    );
};

export default AnnotationCanvas;