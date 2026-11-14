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
function Auth({ onClose, onSuccess }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try { const result = await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: data }); onSuccess(result.user); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return h(Modal, { title: register ? 'Make yourself at home.' : 'Welcome back.', onClose },
    h('p', { className: 'muted' }, 'Good finds. Friendly people. A little less waste.'),
    h('form', { onSubmit: submit, className: 'stack' },
      register && h(Field, { label: 'Your name' }, h('input', { name: 'name', required: true, minLength: 2, maxLength: 60, autoComplete: 'name' })),
      h(Field, { label: 'Email' }, h('input', { name: 'email', type: 'email', required: true, autoComplete: 'email', maxLength: 254 })),
      h(Field, { label: 'Password' }, h('input', { name: 'password', type: 'password', required: true, minLength: 8, maxLength: 128, autoComplete: register ? 'new-password' : 'current-password' })),
      h(Notice, null, error), h(Button, { disabled: busy, type: 'submit' }, busy ? 'One moment…' : register ? 'Create account' : 'Sign in')),
    h('button', { className: 'text-button auth-switch', onClick: () => { setRegister(!register); setError(''); } }, register ? 'Already have an account? Sign in' : 'New around here? Create an account'));
}
function Editor({ item, onClose, onSaved }) {
  const [draft, setDraft] = useState(item ? { ...item, price: item.price / 100 } : emptyDraft);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const update = name => e => setDraft(prev => ({ ...prev, [name]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api(item ? '/listings/' + item.id : '/listings', { method: item ? 'PATCH' : 'POST', body: { ...draft, price: Number(draft.price) } });
      onSaved(result.listing);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return h(Modal, { title: item ? 'A little update.' : 'Give it a second home.', onClose },
    h('form', { onSubmit: submit, className: 'stack' },
      h(Field, { label: 'What are you selling?' }, h('input', { value: draft.title, onChange: update('title'), required: true, minLength: 3, maxLength: 100, placeholder: 'e.g. Oak dining chair' })),
      h('div', { className: 'form-row' },
        h(Field, { label: 'Price · MAD' }, h('input', { value: draft.price, onChange: update('price'), type: 'number', min: 0, max: 10000000, step: '.01', required: true, placeholder: '0' })),
        h(Field, { label: 'City' }, h('input', { value: draft.city, onChange: update('city'), required: true, minLength: 2, maxLength: 80, placeholder: 'Casablanca' }))),
      h('div', { className: 'form-row' },
        h(Field, { label: 'Category' }, h('select', { value: draft.category, onChange: update('category') }, categories.map(c => h('option', { key: c }, c)))),
        h(Field, { label: 'Condition' }, h('select', { value: draft.condition, onChange: update('condition') }, conditions.map(c => h('option', { key: c }, c))))),
      h(Field, { label: 'Tell its story' }, h('textarea', { value: draft.description, onChange: update('description'), rows: 4, required: true, minLength: 10, maxLength: 3000, placeholder: 'Details, dimensions, and anything the next owner should know.' })),
      h(Field, { label: 'Photo URL · optional' }, h('input', { value: draft.image, onChange: update('image'), type: 'url', maxLength: 2000, placeholder: 'https://…' })),
      h('p', { className: 'small muted' }, 'Use a public HTTPS image link. Payments and collection are arranged directly with the buyer.'),
      h(Notice, null, error), h(Button, { type: 'submit', disabled: busy }, busy ? 'Saving…' : item ? 'Save changes' : 'Publish listing')));
}
function Details({ item, user, saved, onClose, onFavorite, onContact, onEdit, onChanged }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const own = item.seller_id === user?.id;
  async function change(remove = false) {
    setBusy(true); setError('');
    try { await api('/listings/' + item.id, { method: remove ? 'DELETE' : 'PATCH', ...(remove ? {} : { body: { status: item.status === 'sold' ? 'available' : 'sold' } }) }); onChanged(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return h(Modal, { title: item.title, onClose, wide: true },
    h('div', { className: 'detail-grid' }, h(Photo, { item, className: 'detail-photo' }),
      h('div', { className: 'stack' }, h('div', { className: 'detail-price' }, money(item.price)),
        h('div', { className: 'tags' }, h('span', null, item.condition), h('span', null, item.category), h('span', null, item.status === 'sold' ? 'Sold' : 'Available')),
        h('p', { className: 'description' }, item.description), h('p', { className: 'muted' }, '⌖ ', item.city),
        h('div', { className: 'seller' }, h('span', { className: 'avatar' }, item.seller_name[0].toUpperCase()), h('div', null, h('strong', null, item.seller_name), h('p', { className: 'small muted' }, 'Seller on Marketday'))),
        own ? h(React.Fragment, null,
          h(Button, { onClick: () => onEdit(item) }, 'Edit listing'),
          h(Button, { secondary: true, disabled: busy, onClick: () => change() }, item.status === 'sold' ? 'Make available again' : 'Mark as sold'),
          confirmDelete ? h('div', { className: 'stack' }, h('p', null, 'Delete this listing permanently?'), h(Button, { className: 'danger', disabled: busy, onClick: () => change(true) }, 'Yes, delete listing'), h('button', { className: 'text-button', onClick: () => setConfirmDelete(false) }, 'Keep listing'))
            : h('button', { className: 'text-button danger-text', onClick: () => setConfirmDelete(true) }, 'Delete listing'))
          : h(React.Fragment, null, h(Button, { disabled: item.status === 'sold', onClick: () => onContact(item) }, item.status === 'sold' ? 'This item has sold' : 'Message seller ↗'),
            h(Button, { secondary: true, onClick: () => onFavorite(item) }, saved ? '♥ Saved to your finds' : '♡ Save for later')),
        h(Notice, null, error))));
}
function Inbox({ user, initial, onClose }) {
  const [conversations, setConversations] = useState([]); const [active, setActive] = useState(initial);
  const [messages, setMessages] = useState([]); const [content, setContent] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const scroll = useRef(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try { const data = await api('/conversations'); if (!cancelled) setConversations(data.conversations); }
      catch (e) { if (!cancelled) setError(e.message); }
    }
    load(); const timer = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  useEffect(() => {
    setMessages([]); setContent(''); setError('');
    if (!active) return;
    let cancelled = false;
    async function load() {
      try { const data = await api(`/conversations/${active.id}/messages`); if (!cancelled) setMessages(data.messages); }
      catch (e) { if (!cancelled) setError(e.message); }
    }
    load(); const timer = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active?.id]);
  useEffect(() => { scroll.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  async function send(e) {
    e.preventDefault(); if (!content.trim() || busy) return; setBusy(true); setError('');
    try {
      const result = await api(`/conversations/${active.id}/messages`, { method: 'POST', body: { content } });
      setMessages(prev => prev.some(m => m.id === result.message.id) ? prev : [...prev, result.message]); setContent('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return h(Modal, { title: 'A conversation starts here.', onClose, wide: true },
    h('div', { className: 'inbox' }, h('aside', { className: 'conversations' },
      !conversations.length && h('p', { className: 'muted' }, 'No conversations yet. Find something you love and say hello.'),
      conversations.map(c => h('button', { key: c.id, className: 'conversation ' + (active?.id === c.id ? 'selected' : ''), onClick: () => setActive(c) },
        h('strong', null, c.title), h('span', null, c.buyer_id === user.id ? c.seller_name : c.buyer_name), h('small', null, c.last_message || 'Say hello →')))),
      h('section', { className: 'chat' }, active ? h(React.Fragment, null,
        h('h3', null, active.title), h('div', { className: 'messages', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' },
          !messages.length && h('p', { className: 'muted' }, 'Ask a question, arrange a viewing, or just say hello.'),
          messages.map(m => h('div', { key: m.id, className: 'bubble ' + (m.sender_id === user.id ? 'own' : '') }, h('p', null, m.content), h('small', null, date(m.created_at)))), h('div', { ref: scroll })),
        h('form', { onSubmit: send, className: 'message-form' }, h('input', { value: content, onChange: e => setContent(e.target.value), 'aria-label': 'Message', placeholder: 'Write a friendly message…', required: true, maxLength: 2000 }), h(Button, { type: 'submit', disabled: busy || !content.trim() }, busy ? '…' : 'Send ↗')))
        : h('p', { className: 'muted chat-empty' }, 'Choose a conversation to pick up where you left off.'))), h(Notice, null, error));
}
