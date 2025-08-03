// frontend/src/components/Controls.jsx

import React, { useState } from 'react';

const Controls = ({ classes, setClasses, activeClass, setActiveClass, onPredict, onClear }) => {
  const [newClassName, setNewClassName] = useState('');

  const handleAddClass = () => {
    if (newClassName && !classes.includes(newClassName)) {
      setClasses([...classes, newClassName]);
      setNewClassName('');
    }
  };

  return (
    <div>
      <h3>Управление классами</h3>
      <div className="class-selector">
        <label>Активный класс:</label>
        <select value={activeClass} onChange={(e) => setActiveClass(e.target.value)}>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="class-adder">
        <input
          type="text"
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
          placeholder="Имя нового класса"
        />
        <button onClick={handleAddClass}>Добавить</button>
      </div>

      <hr style={{margin: '20px 0'}} />

      <h3>Управление сегментацией</h3>
      <button onClick={onPredict}>Сегментировать</button>
      <button onClick={onClear}>Очистить точки</button>
      <p><small>ЛКМ - вкл. область<br/>ПКМ - искл. область</small></p>
    </div>
  );
};

export default Controls;