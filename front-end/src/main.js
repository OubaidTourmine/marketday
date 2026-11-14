import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, categories, conditions, money, date } from './api.js';
import './style.css';

// Plain JavaScript React components; no TypeScript or JSX compiler required.
const h = React.createElement;
const icons = { Home: '⌂', Electronics: '◉', Fashion: '◇', Outdoors: '↗', Books: '▤', Other: '✳' };
const emptyDraft = { title: '', description: '', price: '', category: 'Home', condition: 'Good', city: '', image: '' };
function Button({ children, secondary, className = '', ...props }) {
  return h('button', { ...props, className: `button ${secondary ? 'secondary' : ''} ${className}` }, children);
}
function Field({ label, children }) { return h('label', { className: 'field' }, h('span', null, label), children); }
function Notice({ children }) { return children ? h('p', { role: 'alert', className: 'notice' }, children) : null; }
function Photo({ item, ...props }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.image]);
  return item.image && !failed
    ? h('img', { ...props, src: item.image, alt: item.title, loading: 'lazy', referrerPolicy: 'no-referrer', onError: () => setFailed(true) })
    : h('div', { ...props, className: `photo-placeholder ${props.className || ''}`, role: 'img', 'aria-label': item.title }, h('span', null, icons[item.category] || '✳'));
}
function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return h('dialog', { ref, className: wide ? 'modal wide' : 'modal', onCancel: onClose,
    onClick: e => { if (e.target === ref.current && (e.clientX < e.target.getBoundingClientRect().left || e.clientX > e.target.getBoundingClientRect().right || e.clientY < e.target.getBoundingClientRect().top || e.clientY > e.target.getBoundingClientRect().bottom)) onClose(); } },
    h('div', { className: 'modal-heading' }, h('h2', null, title), h('button', { className: 'icon-button', onClick: onClose, 'aria-label': 'Close dialog' }, '×')),
    children);
}
