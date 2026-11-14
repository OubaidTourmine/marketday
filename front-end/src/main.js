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
function App() {
  const [user, setUser] = useState(null); const [ready, setReady] = useState(false);
  const [view, setView] = useState('browse'); const [query, setQuery] = useState(''); const [search, setSearch] = useState('');
  const [category, setCategory] = useState(''); const [city, setCity] = useState(''); const [sort, setSort] = useState('newest');
  const [items, setItems] = useState([]); const [saved, setSaved] = useState([]); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [modal, setModal] = useState(null); const [selected, setSelected] = useState(null);
  const [editItem, setEditItem] = useState(null); const [conversation, setConversation] = useState(null); const [revision, setRevision] = useState(0); const [toast, setToast] = useState('');
  const [favoriteBusy, setFavoriteBusy] = useState([]);
  useEffect(() => {
    api('/auth/me').then(data => setUser(data.user)).catch(e => { if (e.status !== 401) setError(e.message); }).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!user) { setSaved([]); return; }
    api('/favorites').then(data => { if (!cancelled) setSaved(data.ids); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user]);
  useEffect(() => { const timer = setTimeout(() => setSearch(query), 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false; setLoading(true); setError('');
    const params = new URLSearchParams({ q: search, category, city, sort });
    if (view === 'mine') params.set('mine', 'true');
    if (view === 'saved') params.set('saved', 'true');
    if (view === 'browse') params.set('status', 'available');
    api('/listings?' + params).then(data => { if (!cancelled) setItems(data.listings); })
      .catch(e => { if (!cancelled) { setError(e.message); setItems([]); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, category, city, sort, view, ready, user, revision]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  function requireUser(action) { if (!user) { setModal('auth'); return; } action(); }
  function navigate(next) { setView(next); setQuery(''); setCategory(''); setCity(''); }
  async function favorite(item) {
    if (!user) return setModal('auth');
    if (favoriteBusy.includes(item.id)) return;
    setFavoriteBusy(prev => [...prev, item.id]);
    try {
      const exists = saved.includes(item.id);
      await api('/listings/' + item.id + '/favorite', { method: exists ? 'DELETE' : 'PUT' });
      setSaved(prev => exists ? prev.filter(id => id !== item.id) : [...prev, item.id]);
      if (view === 'saved') setRevision(r => r + 1);
    } catch (e) { setToast(e.message); } finally { setFavoriteBusy(prev => prev.filter(id => id !== item.id)); }
  }
  async function contact(item) {
    if (!user) return setModal('auth');
    try { const result = await api('/conversations', { method: 'POST', body: { listing_id: item.id } }); setConversation(result.conversation); setModal('inbox'); }
    catch (e) { setToast(e.message); }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); setUser(null); setModal(null); navigate('browse'); }
    catch (e) { setToast(e.message); }
  }
  function changed() { setModal(null); setRevision(r => r + 1); setToast('All done. Your listing is up to date.'); }
  const titles = { browse: 'Fresh finds, new possibilities.', saved: 'The ones you’re keeping an eye on.', mine: 'Your little corner of Marketday.' };
  return h(React.Fragment, null,
    h('header', { className: 'header' }, h('div', { className: 'header-inner' },
      h('button', { className: 'brand', onClick: () => navigate('browse'), 'aria-label': 'Marketday home' }, h('span', { className: 'brand-mark' }, 'm'), 'marketday', h('span', { className: 'brand-dot' }, '.')),
      h('nav', { 'aria-label': 'Main navigation' },
        h('button', { className: 'nav-link ' + (view === 'browse' ? 'active' : ''), onClick: () => navigate('browse') }, 'Discover'),
        h('button', { className: 'nav-link ' + (view === 'saved' ? 'active' : ''), onClick: () => requireUser(() => navigate('saved')) }, 'Saved', saved.length > 0 && h('span', { className: 'count' }, saved.length)),
        user && h('button', { className: 'nav-link ' + (view === 'mine' ? 'active' : ''), onClick: () => navigate('mine') }, 'My listings')),
      h('div', { className: 'header-actions' }, user ? h(React.Fragment, null,
        h('button', { className: 'icon-button inbox-button', 'aria-label': 'Open messages', onClick: () => { setConversation(null); setModal('inbox'); } }, '✉'),
        h('button', { className: 'account-button', title: 'Sign out of ' + user.name, onClick: logout }, h('span', { className: 'avatar small-avatar' }, user.name[0].toUpperCase()), h('span', null, 'Sign out')))
        : h('button', { className: 'nav-link', onClick: () => setModal('auth'), disabled: !ready }, 'Sign in'),
        h(Button, { onClick: () => requireUser(() => { setEditItem(null); setModal('editor'); }) }, '+ Sell something')))),
    h('main', { className: 'container' },
      view === 'browse' && h('section', { className: 'hero' }, h('div', { className: 'hero-copy' },
        h('p', { className: 'eyebrow' }, h('span', { className: 'live-dot' }), 'A MARKETPLACE FOR EVERYDAY FINDS'),
        h('h1', null, 'Good things.', h('br'), h('em', null, 'New beginnings.')),
        h('p', { className: 'hero-description' }, 'Find something you’ll love. Pass on something you’ve loved. Make a little room for what’s next.'),
        h('a', { href: '#finds', className: 'hero-link' }, 'Find your next favorite ', h('span', null, '↘'))),
        h('div', { className: 'hero-art', 'aria-hidden': true },
          h('div', { className: 'art-circle' }), h('div', { className: 'art-arch' }), h('div', { className: 'art-vase' }), h('div', { className: 'art-stem stem-one' }), h('div', { className: 'art-stem stem-two' }),
          h('div', { className: 'art-note' }, h('span', null, 'less new.'), h('span', null, 'more you.')), h('span', { className: 'art-star' }, '✳'))),
      h('section', { id: 'finds', className: 'finds' }, h('div', { className: 'section-heading' },
        h('div', null, h('p', { className: 'eyebrow' }, view === 'browse' ? 'WORTH A SECOND LOOK' : view === 'saved' ? 'YOUR SAVED FINDS' : 'YOUR LISTINGS'), h('h2', null, titles[view])),
        h('span', { className: 'result-count' }, loading ? 'Finding good things…' : `${items.length}${items.length === 200 ? '+' : ''} finds`)),
      h('div', { className: 'filters' },
        h('label', { className: 'search' }, h('span', { 'aria-hidden': true }, '⌕'), h('input', { value: query, onChange: e => setQuery(e.target.value), placeholder: 'Search for your next good find', 'aria-label': 'Search listings' })),
        h('select', { value: city, onChange: e => setCity(e.target.value), 'aria-label': 'Filter by city' }, h('option', { value: '' }, 'Everywhere'), ['Casablanca', 'Rabat', 'Marrakech', 'Tangier', 'Fes', 'Agadir'].map(c => h('option', { key: c }, c))),
        h('select', { value: sort, onChange: e => setSort(e.target.value), 'aria-label': 'Sort listings' }, h('option', { value: 'newest' }, 'Newest first'), h('option', { value: 'lowest' }, 'Price: low to high'), h('option', { value: 'highest' }, 'Price: high to low'))),
      h('div', { className: 'categories', 'aria-label': 'Categories' }, ['', ...categories].map(c => h('button', { key: c, className: 'category ' + (category === c ? 'selected' : ''), 'aria-pressed': category === c, onClick: () => setCategory(c) }, c && h('span', { 'aria-hidden': true }, icons[c]), c || 'All good things'))),
      h(Notice, null, error), error && h('button', { className: 'text-button', onClick: () => setRevision(r => r + 1) }, 'Try again'),
      loading ? h('div', { className: 'product-grid', 'aria-label': 'Loading listings', 'aria-busy': true }, Array.from({ length: 8 }, (_, i) => h('div', { key: i, className: 'skeleton' })))
        : items.length ? h('div', { className: 'product-grid' }, items.map(item => h('article', { key: item.id, className: 'product-card' },
          h('div', { className: 'product-image' }, h('button', { className: 'image-open', onClick: () => { setSelected(item); setModal('detail'); }, 'aria-label': 'View ' + item.title }, h(Photo, { item })),
            h('span', { className: 'condition' }, item.status === 'sold' ? 'Sold' : item.condition),
            h('button', { className: 'save-button ' + (saved.includes(item.id) ? 'is-saved' : ''), disabled: favoriteBusy.includes(item.id), onClick: () => favorite(item), 'aria-label': (saved.includes(item.id) ? 'Unsave ' : 'Save ') + item.title, 'aria-pressed': saved.includes(item.id) }, saved.includes(item.id) ? '♥' : '♡')),
          h('div', { className: 'product-info' }, h('div', { className: 'product-title-row' }, h('button', { className: 'product-title', onClick: () => { setSelected(item); setModal('detail'); } }, item.title), h('strong', null, money(item.price))),
            h('p', null, item.category, h('span', { className: 'separator' }, '·'), item.city)))))
          : !error && h('div', { className: 'empty-state' }, h('span', null, '✳'), h('h3', null, view === 'mine' ? 'Your first listing starts here.' : view === 'saved' ? 'A little space for your favorites.' : 'No finds just yet.'),
            h('p', null, view === 'mine' ? 'Something you no longer need could be someone else’s favorite.' : view === 'saved' ? 'Tap the heart on anything that catches your eye.' : 'Try another search or give those filters a little room.'),
            h(Button, { secondary: true, onClick: () => view === 'mine' ? requireUser(() => { setEditItem(null); setModal('editor'); }) : navigate('browse') }, view === 'mine' ? 'Create a listing' : 'Explore all finds')))),
    h('section', { className: 'sell-banner' }, h('div', null, h('p', { className: 'eyebrow' }, 'SOMEONE’S NEXT FAVORITE'), h('h2', null, 'A little less clutter.', h('br'), 'A lot more possibility.')), h(Button, { secondary: true, onClick: () => requireUser(() => { setEditItem(null); setModal('editor'); }) }, 'Make room. Sell something ↗')),
    h('footer', { className: 'footer' }, h('span', { className: 'footer-brand' }, 'marketday.'), h('p', null, 'Good things deserve another chapter.'), h('span', null, 'Made for a little more circular living.')),
    toast && h('div', { className: 'toast', role: 'status' }, toast),
    modal === 'auth' && h(Auth, { onClose: () => setModal(null), onSuccess: user => { setUser(user); setModal(null); setToast('Welcome, ' + user.name + '. Make yourself at home.'); } }),
    modal === 'editor' && h(Editor, { item: editItem, onClose: () => setModal(null), onSaved: () => { changed(); navigate('mine'); } }),
    modal === 'detail' && selected && h(Details, { item: selected, user, saved: saved.includes(selected.id), onClose: () => setModal(null), onFavorite: favorite, onContact: contact, onEdit: item => { setEditItem(item); setModal('editor'); }, onChanged: changed }),
    modal === 'inbox' && user && h(Inbox, { user, initial: conversation, onClose: () => setModal(null) }));
}
createRoot(document.getElementById('root')).render(h(App));
