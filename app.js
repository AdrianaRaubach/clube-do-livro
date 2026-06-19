'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let db        = null;
let books     = [];
let activeFilter = 'todos';
let sortOrder = 'desc';
let suggestionReactionFilter = null;
let starVal   = 0;
let editingId = null;
let toastTimer = null;
let currentUser = null;
let detailStarVal = 0;
let posts = [];
const expandedComments = new Set();
let pendingImage = null;
let encontros = [];
let editingMeetingId = null;

const REACOES = [
    { emoji: '😍', label: 'Amei a ideia!' },
    { emoji: '🙂', label: 'Toparia ler' },
    { emoji: '😐', label: 'Tanto faz' },
    { emoji: '😩', label: 'Prefiro não' },
];

// ── Firebase Init ─────────────────────────────────────────────────────────────
function initApp() {
    try {
        if (
            typeof firebaseConfig === 'undefined' ||
            !firebaseConfig.projectId ||
            firebaseConfig.projectId === 'SEU_PROJECT_ID'
        ) {
            hide('loading');
            show('config-warning');
            return;
        }
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();

        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                const nameEl = document.getElementById('user-name');
                if (nameEl) nameEl.textContent = user.displayName || user.email.split('@')[0];
                const nome = user.displayName || user.email.split('@')[0];
                const avatarEl = document.getElementById('compose-avatar');
                if (avatarEl) {
                    const [bg, txt] = avatarColors(nome);
                    avatarEl.style.background = bg;
                    avatarEl.style.color = txt;
                    avatarEl.textContent = initials(nome);
                }
                hide('login-screen');
                listenBooks();
                listenPosts();
                listenEncontros();
            } else {
                currentUser = null;
                hide('loading');
                show('login-screen');
            }
        });
    } catch (e) {
        console.error(e);
        hide('loading');
        show('config-warning');
    }
}

async function login(e) {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    const errEl    = document.getElementById('login-error');

    btn.disabled = true;
    btn.textContent = 'Entrando...';
    errEl.classList.add('hidden');

    try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        // onAuthStateChanged cuida do resto
    } catch {
        errEl.textContent = 'E-mail ou senha incorretos.';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Entrar';
    }
}

async function logout() {
    await firebase.auth().signOut();
    books = [];
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = '';
    show('login-screen');
}

function listenBooks() {
    db.collection('livros')
        .orderBy('createdAt', 'desc')
        .onSnapshot(
            snap => {
                books = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                hide('loading');
                renderAll();
            },
            err => {
                console.error(err);
                hide('loading');
                toast('Erro ao carregar dados. Verifique o Firebase.');
            }
        );
}

function renderAll() {
    renderHome();
    renderLibrary();
    renderSuggestions();
    renderCalendario();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function showTab(name) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('text-white', 'border-amber-400');
        btn.classList.add('text-rose-300', 'border-transparent');
    });
    document.getElementById('content-' + name).classList.add('active');
    const btn = document.getElementById('tab-btn-' + name);
    btn.classList.add('text-white', 'border-amber-400');
    btn.classList.remove('text-rose-300', 'border-transparent');
}

// ── Render: Home ──────────────────────────────────────────────────────────────
function renderHome() {
    renderCurrentBook();
    renderRecent();
}

function renderCurrentBook() {
    const el = document.getElementById('current-book');
    const reading = books.find(b => b.status === 'lendo');

    if (!reading) {
        el.innerHTML = `
        <div class="bg-white rounded-2xl p-8 text-center shadow-sm border border-stone-100">
            <div class="text-5xl mb-3">📚</div>
            <p class="text-stone-400 mb-3 text-sm">Nenhum livro sendo lido no momento.</p>
            <button onclick="openAddModal()" class="text-rose-700 text-sm font-medium underline">
                Adicionar leitura atual →
            </button>
        </div>`;
        return;
    }

    el.innerHTML = `
    <div class="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
        <div class="h-1.5 bg-gradient-to-r from-rose-700 to-rose-400"></div>
        <div class="p-6 flex gap-5">
            ${bookCover(reading, 'w-28 h-40 flex-shrink-0 rounded-xl shadow')}
            <div class="flex-1 min-w-0">
                <span class="inline-flex items-center gap-1 bg-rose-100 text-rose-700 text-xs font-semibold px-2.5 py-1 rounded-full mb-2">
                    📖 Lendo agora
                </span>
                <h2 class="font-display text-2xl font-bold text-stone-900 leading-tight">${esc(reading.titulo)}</h2>
                <p class="text-stone-500 mt-1">${esc(reading.autor)}</p>
                ${reading.mes ? `<p class="text-stone-400 text-xs mt-1">📅 ${fmtMonth(reading.mes)}</p>` : ''}
                ${reading.sugeridoPor ? `<p class="text-stone-400 text-xs mt-0.5">Sugerido por <strong>${esc(reading.sugeridoPor)}</strong></p>` : ''}
                ${reading.comentarios
                    ? `<p class="text-stone-500 text-sm mt-3 leading-relaxed line-clamp-3">${esc(reading.comentarios)}</p>`
                    : ''}
                <button onclick="openDetail('${reading.id}')"
                    class="mt-4 text-sm text-rose-700 font-medium hover:underline">
                    Ver detalhes →
                </button>
            </div>
        </div>
    </div>`;
}

function renderRecent() {
    const el = document.getElementById('recent-books');
    const recent = books
        .filter(b => b.status === 'lido')
        .sort((a, b) => (b.dataTermino || '').localeCompare(a.dataTermino || ''))
        .slice(0, 4);
    if (!recent.length) {
        el.innerHTML = `<p class="col-span-full text-stone-400 text-sm text-center py-6">Nenhuma leitura concluída ainda.</p>`;
        return;
    }
    el.innerHTML = recent.map(b => miniCard(b)).join('');
}

// ── Render: Library ───────────────────────────────────────────────────────────
function sortedBooks(arr) {
    return [...arr].sort((a, b) => {
        const da = a.dataTermino || '';
        const db = b.dataTermino || '';
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return sortOrder === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
    });
}

function toggleSort() {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    renderLibrary();
}

function renderLibrary() {
    const search = (document.getElementById('search')?.value || '').toLowerCase().trim();
    let filtered = activeFilter === 'todos' ? books : books.filter(b => b.status === activeFilter);
    if (search) {
        filtered = filtered.filter(b =>
            b.titulo?.toLowerCase().includes(search) ||
            b.autor?.toLowerCase().includes(search)
        );
    }
    filtered = sortedBooks(filtered);

    const grid = document.getElementById('books-grid');
    const empty = document.getElementById('library-empty');

    if (!filtered.length) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        grid.innerHTML = filtered.map(b => fullCard(b)).join('');
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
        const active = btn.dataset.filter === activeFilter;
        btn.className = 'filter-btn px-4 py-2 rounded-full text-sm font-medium transition-all ' +
            (active
                ? 'bg-rose-800 text-white shadow-sm'
                : 'bg-white text-stone-600 border border-stone-200 hover:border-rose-300');
    });

    const sortBtn = document.getElementById('sort-btn');
    if (sortBtn) sortBtn.textContent = sortOrder === 'desc' ? '↓ Leituras recentes' : '↑ Leituras antigas';
}

function setFilter(f) {
    activeFilter = f;
    renderLibrary();
}

function countReaction(book, emoji) {
    return Object.values(book.reacoes || {}).filter(r => r.emoji === emoji).length;
}

function setSuggestionFilter(emoji) {
    suggestionReactionFilter = suggestionReactionFilter === emoji ? null : emoji;
    renderSuggestions();
}

// ── Render: Suggestions ───────────────────────────────────────────────────────
function renderSuggestions() {
    const list  = document.getElementById('suggestions-list');
    const empty = document.getElementById('suggestions-empty');
    const allSugs = books.filter(b => b.status === 'proximo');

    const filtersEl = document.getElementById('reaction-filters');
    if (filtersEl) {
        filtersEl.innerHTML = `<span class="self-center text-xs font-semibold text-stone-400 uppercase tracking-wide mr-1">Filtrar por reação:</span>` + REACOES.map(r => {
            const total   = allSugs.reduce((sum, b) => sum + countReaction(b, r.emoji), 0);
            const active  = suggestionReactionFilter === r.emoji;
            return `
            <button onclick="setSuggestionFilter('${r.emoji}')" title="${r.label}"
                class="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all border
                    ${active
                        ? 'bg-rose-800 text-white border-rose-800 shadow-sm'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-rose-300'}">
                <span>${r.emoji}</span>
                <span class="text-xs">${r.label}</span>
                ${total ? `<span class="text-xs font-bold ${active ? 'text-rose-200' : 'text-stone-400'}">${total}</span>` : ''}
            </button>`;
        }).join('');
    }

    const sugs = allSugs.sort((a, b) => {
        if (suggestionReactionFilter) {
            return countReaction(b, suggestionReactionFilter) - countReaction(a, suggestionReactionFilter);
        }
        return Object.keys(b.reacoes || {}).length - Object.keys(a.reacoes || {}).length;
    });

    if (!sugs.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');
    list.innerHTML = sugs.map(b => `
        <div class="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 book-card">
            <div class="flex gap-4 items-start">
                ${bookCover(b, 'w-14 h-20 flex-shrink-0 rounded-xl shadow')}
                <div class="flex-1 min-w-0">
                    <h3 class="font-display text-base font-semibold text-stone-800 leading-tight">${esc(b.titulo)}</h3>
                    <p class="text-stone-400 text-sm mt-0.5 truncate">${esc(b.autor)}</p>
                    ${b.sugeridoPor ? `<p class="text-xs text-stone-400 mt-0.5">por <em>${esc(b.sugeridoPor)}</em></p>` : ''}
                </div>
                <button onclick="openDetail('${b.id}')" class="text-stone-300 hover:text-stone-500 text-sm flex-shrink-0 transition-colors" title="Editar">✏️</button>
            </div>
            ${reactionSection(b)}
        </div>`
    ).join('');
}

// ── Card templates ────────────────────────────────────────────────────────────
function bookCover(book, cls) {
    const palettes = [
        ['#f9d4cc','#f2a89c'], ['#d4c8f5','#c4a8e8'], ['#fde8b4','#f5c96a'],
        ['#c8e8d4','#98d4b0'], ['#c8ddf5','#90bce8'], ['#f5c8e0','#e890b8'],
    ];
    const idx = book.titulo
        ? [...book.titulo].reduce((a, c) => a + c.charCodeAt(0), 0) % palettes.length
        : 0;
    const [c1, c2] = palettes[idx];
    return `
    <div class="${cls} relative overflow-hidden flex flex-col items-center justify-center p-2"
        style="background: linear-gradient(160deg, ${c1}, ${c2})">
        <span class="text-2xl opacity-30 mb-1">📖</span>
        <p class="text-center text-[9px] font-display font-bold leading-tight line-clamp-3 px-1"
            style="color: rgba(40,15,20,0.45)">${esc(book.titulo || '')}</p>
        ${book.capaUrl
            ? `<img src="${esc(book.capaUrl)}" class="absolute inset-0 w-full h-full object-contain" loading="lazy" onerror="this.remove()">`
            : ''}
    </div>`;
}

function statusBadge(status) {
    const styles = { lendo: 'bg-blue-100 text-blue-700', lido: 'bg-emerald-100 text-emerald-700', proximo: 'bg-amber-100 text-amber-700' };
    const labels = { lendo: 'Lendo', lido: 'Lido', proximo: 'Próximo' };
    return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${styles[status] || 'bg-stone-100 text-stone-500'}">${labels[status] || status}</span>`;
}

function reactionSection(book) {
    const reacoes  = book.reacoes || {};
    const myUid    = currentUser?.uid;
    const myEmoji  = myUid ? reacoes[myUid]?.emoji : null;
    const entries  = Object.entries(reacoes);

    const membersHtml = entries.length
        ? `<div class="flex gap-3 flex-wrap mb-3">
            ${entries.map(([, r]) => `
                <div class="flex flex-col items-center gap-0.5">
                    <span class="text-xl leading-none">${r.emoji}</span>
                    <span class="text-[10px] text-stone-400 max-w-[48px] truncate text-center">${esc(r.nome)}</span>
                </div>`).join('')}
           </div>`
        : `<p class="text-xs text-stone-300 mb-3">Nenhuma reação ainda.</p>`;

    const btnsHtml = REACOES.map(r => `
        <button onclick="setReaction('${book.id}', '${r.emoji}')" title="${r.label}"
            class="text-xl rounded-xl px-2 py-1.5 transition-all ${myEmoji === r.emoji
                ? 'bg-rose-100 ring-2 ring-rose-300 scale-110'
                : 'opacity-50 hover:opacity-100 hover:bg-stone-100'}">
            ${r.emoji}
        </button>`).join('');

    return `
    <div class="mt-3 pt-3 border-t border-stone-100">
        ${membersHtml}
        <div class="flex items-center gap-1">
            <span class="text-xs text-stone-400 mr-1 flex-shrink-0">Sua reação:</span>
            ${btnsHtml}
        </div>
    </div>`;
}

function avgStars(book) {
    const avs = Object.values(book.avaliacoes || {});
    if (!avs.length) return 0;
    return Math.round(avs.reduce((sum, a) => sum + a.estrelas, 0) / avs.length);
}

function avaliacoesSection(book) {
    const avs   = book.avaliacoes || {};
    const myUid = currentUser?.uid;
    const myAv  = myUid ? avs[myUid] : null;
    detailStarVal = myAv?.estrelas || 0;

    const allReviewsHtml = Object.entries(avs)
        .map(([uid, av]) => {
            const isMe = uid === myUid;
            return `
            <div class="flex items-start justify-between mb-3 ${isMe ? 'bg-rose-50 rounded-xl px-2 py-1.5 -mx-2' : ''}">
                <div>
                    <span class="text-xs font-semibold text-stone-600">${esc(av.nome)}${isMe ? ' <span class="text-rose-400 font-normal">(você)</span>' : ''}</span>
                    ${av.comentario ? `<p class="text-stone-400 text-xs mt-0.5 italic">"${esc(av.comentario)}"</p>` : ''}
                </div>
                <div class="text-sm leading-none flex-shrink-0 ml-3" style="color:#f59e0b">${'★'.repeat(av.estrelas)}<span style="color:#e5e7eb">${'★'.repeat(5 - av.estrelas)}</span></div>
            </div>`;
        }).join('');

    const myStarsHtml = [1, 2, 3, 4, 5].map(v => `
        <span class="detail-star text-2xl cursor-pointer select-none transition-transform hover:scale-110"
            data-v="${v}"
            style="color:${v <= detailStarVal ? '#f59e0b' : '#d1d5db'}"
            onclick="setDetailStars(${v})"
            onmouseover="hoverDetailStars(${v})"
            onmouseout="resetDetailStars()">★</span>`).join('');

    return `
    <div class="mt-4 pt-4 border-t border-stone-100">
        <p class="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Avaliações</p>
        ${allReviewsHtml || '<p class="text-xs text-stone-300 mb-3">Nenhuma avaliação ainda. Seja a primeira!</p>'}
        <div class="bg-stone-50 rounded-xl p-3">
            <p class="text-xs font-semibold text-stone-500 mb-2">${esc(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Você')}:</p>
            <div class="flex gap-0.5 mb-2">${myStarsHtml}</div>
            <textarea id="detail-comment" rows="2" placeholder="Seu comentário (opcional)"
                class="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none bg-white">${esc(myAv?.comentario || '')}</textarea>
            <button onclick="saveAvaliacao('${book.id}')"
                class="mt-2 w-full bg-rose-800 hover:bg-rose-900 text-white py-2 rounded-lg text-xs font-semibold transition-colors">
                Salvar avaliação
            </button>
        </div>
    </div>`;
}

function starsHtml(n) {
    if (!n) return '';
    return `<span style="color:#f59e0b;font-size:0.7rem">${'★'.repeat(n)}<span style="color:#e5e7eb">${'★'.repeat(5 - n)}</span></span>`;
}

function fullCard(b) {
    const accentColor = { lendo: '#60a5fa', lido: '#34d399', proximo: '#fbbf24' }[b.status] || '#e5e7eb';
    return `
    <div onclick="openDetail('${b.id}')" class="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 book-card cursor-pointer"
        style="border-top: 2.5px solid ${accentColor}">
        <div class="relative" style="aspect-ratio:2/3">
            ${bookCover(b, 'absolute inset-0 w-full h-full rounded-none')}
            <div class="absolute top-2 left-2">${statusBadge(b.status)}</div>
        </div>
        <div class="p-3">
            <h3 class="font-display text-sm font-semibold text-stone-800 line-clamp-2 leading-snug">${esc(b.titulo)}</h3>
            <p class="text-stone-400 text-xs mt-0.5 truncate">${esc(b.autor)}</p>
            <div class="flex items-center gap-2 mt-1.5">
                ${avgStars(b) ? starsHtml(avgStars(b)) : ''}
                ${b.mes ? `<span class="text-stone-300 text-xs">${fmtMonth(b.mes)}</span>` : ''}
            </div>
            ${b.status === 'lendo' ? `
            <button onclick="event.stopPropagation(); quickStatusChange('${b.id}', 'lido')"
                class="mt-2 w-full text-xs font-semibold py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                ✅ Marcar como lido
            </button>` : ''}
            ${b.status === 'proximo' ? `
            <button onclick="event.stopPropagation(); quickStatusChange('${b.id}', 'lendo')"
                class="mt-2 w-full text-xs font-semibold py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                📖 Iniciar leitura
            </button>` : ''}
        </div>
    </div>`;
}

function miniCard(b) {
    return `
    <div onclick="openDetail('${b.id}')" class="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 book-card cursor-pointer">
        <div class="relative" style="aspect-ratio:2/3">
            ${bookCover(b, 'absolute inset-0 w-full h-full rounded-none')}
        </div>
        <div class="p-2">
            <h3 class="font-display text-xs font-semibold text-stone-800 line-clamp-2 leading-tight">${esc(b.titulo)}</h3>
            ${avgStars(b) ? `<div class="mt-0.5">${starsHtml(avgStars(b))}</div>` : ''}
        </div>
    </div>`;
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function openDetail(id) {
    const b = books.find(x => x.id === id);
    if (!b) return;

    document.getElementById('detail-content').innerHTML = `
        <div class="flex justify-between items-start mb-4">
            ${statusBadge(b.status)}
            <button onclick="closeDetail()"
                class="text-stone-400 hover:text-stone-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-xl">&times;</button>
        </div>
        <div class="flex gap-4 mb-5">
            ${bookCover(b, 'w-24 h-36 flex-shrink-0 rounded-xl shadow')}
            <div>
                <h2 class="font-display text-xl font-bold text-stone-900 leading-tight">${esc(b.titulo)}</h2>
                <p class="text-stone-500 text-sm mt-1">${esc(b.autor)}</p>
                ${b.mes ? `<p class="text-stone-400 text-xs mt-1">📅 ${fmtMonth(b.mes)}</p>` : ''}
                ${b.dataInicio ? `<p class="text-stone-400 text-xs mt-0.5">▶️ Início: ${fmtDate(b.dataInicio)}</p>` : ''}
                ${b.dataTermino ? `<p class="text-stone-400 text-xs mt-0.5">✅ Término: ${fmtDate(b.dataTermino)}</p>` : ''}
                ${(b.generoLiterario || b.pais || b.generoAutor) ? `
                <div class="flex flex-wrap gap-1.5 mt-2">
                    ${b.generoLiterario ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">${esc(b.generoLiterario)}</span>` : ''}
                    ${b.pais ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">${esc(b.pais)}</span>` : ''}
                    ${b.generoAutor ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">${esc(b.generoAutor)}</span>` : ''}
                </div>` : ''}
                ${avgStars(b) ? `<div class="mt-2">${starsHtml(avgStars(b))}</div>` : ''}
                ${b.sugeridoPor ? `<p class="text-xs text-stone-400 mt-1.5">Sugerido por: <strong>${esc(b.sugeridoPor)}</strong></p>` : ''}
            </div>
        </div>
        ${b.comentarios ? `
            <div class="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                <p class="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1.5">Sinopse</p>
                <p class="text-stone-600 text-sm leading-relaxed">${esc(b.comentarios)}</p>
            </div>` : ''}
        ${['lido', 'lendo'].includes(b.status) ? avaliacoesSection(b) : ''}
        ${b.status === 'proximo' ? `
            <div class="bg-stone-50 rounded-xl p-4 mb-4">
                ${reactionSection(b)}
            </div>` : ''}
        <div class="flex gap-3">
            <button onclick="openEditModal('${b.id}')"
                class="flex-1 bg-rose-800 hover:bg-rose-900 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                ✏️ Editar
            </button>
            <button onclick="confirmDelete('${b.id}')"
                class="px-4 py-2.5 border border-red-200 text-red-400 hover:bg-red-50 rounded-xl text-sm transition-colors">
                🗑️
            </button>
        </div>`;

    show('detail-modal');
}

function closeDetail() {
    hide('detail-modal');
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────
function updateDateFields() {
    const status = document.getElementById('f-status').value;
    const showInicio  = status === 'lendo' || status === 'lido';
    const showTermino = status === 'lido';
    document.getElementById('date-fields-grid').classList.toggle('hidden', !showInicio);
    document.getElementById('wrap-data-inicio').classList.toggle('hidden', !showInicio);
    document.getElementById('wrap-data-termino').classList.toggle('hidden', !showTermino);
}

function openAddModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = 'Adicionar Livro';
    document.getElementById('book-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('cover-preview').classList.add('hidden');
    updateDateFields();
    show('modal');
}

function openEditModal(id) {
    const b = books.find(x => x.id === id);
    if (!b) return;
    closeDetail();
    editingId = id;

    document.getElementById('modal-title').textContent = 'Editar Livro';
    document.getElementById('edit-id').value = id;
    document.getElementById('f-titulo').value = b.titulo || '';
    document.getElementById('f-autor').value = b.autor || '';
    document.getElementById('f-capa').value = b.capaUrl || '';
    document.getElementById('f-status').value = b.status || 'proximo';
    document.getElementById('f-mes').value = b.mes || '';
    document.getElementById('f-data-inicio').value = b.dataInicio || '';
    document.getElementById('f-data-termino').value = b.dataTermino || '';
    updateDateFields();
    document.getElementById('f-genero-autor').value = b.generoAutor || '';
    document.getElementById('f-genero-literario').value = b.generoLiterario || '';
    document.getElementById('f-pais').value = b.pais || '';
    document.getElementById('f-comentarios').value = b.comentarios || '';
    document.getElementById('f-sugerido').value = b.sugeridoPor || '';
    const preview = document.getElementById('cover-preview');
    if (b.capaUrl) { preview.src = b.capaUrl; preview.classList.remove('hidden'); }
    else { preview.classList.add('hidden'); }

    show('modal');
}

function closeModal() {
    hide('modal');
}

function previewCover() {
    const url = document.getElementById('f-capa').value.trim();
    const img = document.getElementById('cover-preview');
    if (url) {
        img.src = url;
        img.classList.remove('hidden');
        img.onerror = () => img.classList.add('hidden');
    } else {
        img.classList.add('hidden');
    }
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function renderStars(val) {
    starVal = val;
    document.getElementById('f-avaliacao').value = val;
    document.querySelectorAll('.star').forEach(s => {
        s.style.color = parseInt(s.dataset.v) <= val ? '#f59e0b' : '#d1d5db';
    });
}

document.querySelectorAll('.star').forEach(s => {
    s.addEventListener('click', () => renderStars(parseInt(s.dataset.v)));
    s.addEventListener('mouseover', () => {
        const v = parseInt(s.dataset.v);
        document.querySelectorAll('.star').forEach(ss => {
            ss.style.color = parseInt(ss.dataset.v) <= v ? '#f59e0b' : '#d1d5db';
        });
    });
    s.addEventListener('mouseout', () => renderStars(starVal));
});

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function saveBook(e) {
    e.preventDefault();
    if (!db) return;

    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const data = {
        titulo:      document.getElementById('f-titulo').value.trim(),
        autor:       document.getElementById('f-autor').value.trim(),
        capaUrl:     document.getElementById('f-capa').value.trim(),
        status:      document.getElementById('f-status').value,
        mes:         document.getElementById('f-mes').value,
        dataInicio:  document.getElementById('f-data-inicio').value,
        dataTermino: document.getElementById('f-data-termino').value,
        generoAutor:    document.getElementById('f-genero-autor').value,
        generoLiterario: document.getElementById('f-genero-literario').value.trim(),
        pais:           document.getElementById('f-pais').value.trim(),
        comentarios:    document.getElementById('f-comentarios').value.trim(),
        sugeridoPor:    document.getElementById('f-sugerido').value.trim(),
    };

    try {
        if (editingId) {
            await db.collection('livros').doc(editingId).update(data);
            toast('Livro atualizado! ✅');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            data.votos = 0;
            await db.collection('livros').add(data);
            toast('Livro adicionado! 📚');
        }
        closeModal();
    } catch (err) {
        console.error(err);
        toast('Erro ao salvar. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

async function confirmDelete(id) {
    if (!confirm('Remover este livro? Essa ação não pode ser desfeita.')) return;
    try {
        await db.collection('livros').doc(id).delete();
        toast('Livro removido.');
        closeDetail();
    } catch {
        toast('Erro ao remover.');
    }
}

function setDetailStars(val) {
    detailStarVal = val;
    document.querySelectorAll('.detail-star').forEach(s => {
        s.style.color = parseInt(s.dataset.v) <= val ? '#f59e0b' : '#d1d5db';
    });
}

function hoverDetailStars(val) {
    document.querySelectorAll('.detail-star').forEach(s => {
        s.style.color = parseInt(s.dataset.v) <= val ? '#f59e0b' : '#d1d5db';
    });
}

function resetDetailStars() { setDetailStars(detailStarVal); }

async function saveAvaliacao(bookId) {
    if (!db || !currentUser) return;
    if (!detailStarVal) { toast('Selecione ao menos uma estrela.'); return; }

    const nome       = currentUser.displayName || currentUser.email.split('@')[0];
    const comentario = document.getElementById('detail-comment')?.value.trim() || '';
    const update     = {};
    update[`avaliacoes.${currentUser.uid}`] = { estrelas: detailStarVal, comentario, nome };

    try {
        await db.collection('livros').doc(bookId).update(update);
        toast('Avaliação salva! ✨');
        closeDetail();
    } catch (err) {
        console.error(err);
        toast('Erro ao salvar avaliação.');
    }
}

async function setReaction(bookId, emoji) {
    if (!db || !currentUser) return;
    const nome = currentUser.displayName || currentUser.email.split('@')[0];
    const book = books.find(b => b.id === bookId);
    const currentEmoji = book?.reacoes?.[currentUser.uid]?.emoji;

    const update = {};
    if (currentEmoji === emoji) {
        update[`reacoes.${currentUser.uid}`] = firebase.firestore.FieldValue.delete();
    } else {
        update[`reacoes.${currentUser.uid}`] = { emoji, nome };
    }

    try {
        await db.collection('livros').doc(bookId).update(update);
    } catch (err) {
        console.error(err);
        toast('Erro ao registrar reação.');
    }
}

// ── Posts ─────────────────────────────────────────────────────────────────────
function listenPosts() {
    db.collection('postagens')
        .orderBy('createdAt', 'desc')
        .onSnapshot(
            snap => {
                posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderPosts();
            },
            err => console.error(err)
        );
}

function renderPosts() {
    const feed = document.getElementById('posts-feed');
    if (!feed) return;
    if (!posts.length) {
        feed.innerHTML = `
        <div class="text-center py-16 text-stone-400">
            <div class="text-5xl mb-3">✍️</div>
            <p class="text-sm">Nenhuma postagem ainda. Seja o primeiro!</p>
        </div>`;
        return;
    }
    feed.innerHTML = posts.map(p => postCard(p)).join('');
}

function postCard(p) {
    const curtidas = p.curtidas || {};
    const liked = currentUser && curtidas[currentUser.uid];
    const likeCount = Object.keys(curtidas).length;
    const comments = p.comentarios || [];
    const isExpanded = expandedComments.has(p.id);
    const [bgColor, textColor] = avatarColors(p.autorNome);

    const commentsHtml = isExpanded ? `
    <div class="mt-3 pt-3 border-t border-stone-100">
        ${comments.length ? comments.map(c => {
            const [cbg, ctxt] = avatarColors(c.autorNome);
            return `
            <div class="flex gap-2 mb-2.5">
                <div class="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                    style="background:${cbg}; color:${ctxt}">${esc(initials(c.autorNome))}</div>
                <div class="flex-1 bg-stone-50 rounded-xl px-3 py-2">
                    <span class="text-xs font-semibold text-stone-700">${esc(c.autorNome)}</span>
                    <span class="text-[10px] text-stone-400 ml-1.5">${relTime(c.createdAt)}</span>
                    <p class="text-sm text-stone-600 mt-0.5 leading-snug">${esc(c.texto)}</p>
                </div>
            </div>`;
        }).join('') : '<p class="text-xs text-stone-400 mb-3">Nenhum comentário ainda.</p>'}
        <div class="flex gap-2 mt-2">
            <input type="text" id="comment-input-${p.id}" placeholder="Escreva um comentário..."
                onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();submitComment('${p.id}')}"
                class="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300">
            <button onclick="submitComment('${p.id}')"
                class="px-4 py-2 bg-rose-800 text-white text-sm font-medium rounded-xl hover:bg-rose-900 transition-colors">
                Enviar
            </button>
        </div>
    </div>` : '';

    return `
    <div class="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 fade-up">
        <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
                    style="background:${bgColor}; color:${textColor}">${esc(initials(p.autorNome))}</div>
                <div>
                    <p class="text-sm font-semibold text-stone-800">${esc(p.autorNome)}</p>
                    <p class="text-[11px] text-stone-400">${relTime(p.createdAt)}</p>
                </div>
            </div>
            ${p.autorUid === currentUser?.uid ? `
            <button onclick="deletePost('${p.id}')"
                class="text-stone-300 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-red-50">
                🗑️
            </button>` : ''}
        </div>
        ${p.texto ? `<p class="text-stone-700 text-sm leading-relaxed whitespace-pre-wrap">${esc(p.texto)}</p>` : ''}
        ${p.imagemUrl ? `<img src="${esc(p.imagemUrl)}" class="mt-3 w-full rounded-xl object-cover max-h-80" loading="lazy">` : ''}
        <div class="flex items-center gap-5 mt-3 pt-3 border-t border-stone-100">
            <button onclick="toggleLike('${p.id}')"
                class="flex items-center gap-1.5 text-sm transition-all ${liked ? 'text-rose-600 font-semibold' : 'text-stone-400 hover:text-rose-500'}">
                <span class="text-base leading-none">${liked ? '♥' : '♡'}</span>
                <span>${likeCount || ''}</span>
            </button>
            <button onclick="toggleComments('${p.id}')"
                class="flex items-center gap-1.5 text-sm transition-all ${isExpanded ? 'text-rose-600 font-semibold' : 'text-stone-400 hover:text-rose-500'}">
                <span class="text-base leading-none">💬</span>
                <span>${comments.length || ''}</span>
            </button>
        </div>
        ${commentsHtml}
    </div>`;
}

function selectImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    pendingImage = file;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('image-preview').src = e.target.result;
        document.getElementById('image-preview-wrap').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function removeImage() {
    pendingImage = null;
    document.getElementById('image-preview').src = '';
    document.getElementById('image-preview-wrap').classList.add('hidden');
}

async function submitPost() {
    if (!db || !currentUser) return;
    const textarea = document.getElementById('post-textarea');
    const texto = textarea?.value.trim();
    if (!texto && !pendingImage) { toast('Escreva algo ou adicione uma imagem.'); return; }

    const btn = document.getElementById('post-btn');
    btn.disabled = true;
    btn.textContent = 'Publicando...';

    try {
        let imagemUrl = null;
        if (pendingImage) {
            const ext = pendingImage.name.split('.').pop();
            const ref = firebase.storage().ref(`postagens/${currentUser.uid}_${Date.now()}.${ext}`);
            await ref.put(pendingImage);
            imagemUrl = await ref.getDownloadURL();
        }

        const post = {
            texto,
            autorUid: currentUser.uid,
            autorNome: currentUser.displayName || currentUser.email.split('@')[0],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            curtidas: {},
            comentarios: [],
        };
        if (imagemUrl) post.imagemUrl = imagemUrl;

        await db.collection('postagens').add(post);
        textarea.value = '';
        removeImage();
        toast('Postagem publicada! ✨');
    } catch (err) {
        console.error(err);
        toast('Erro ao publicar.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Publicar';
    }
}

async function toggleLike(postId) {
    if (!db || !currentUser) return;
    const post = posts.find(p => p.id === postId);
    const liked = post?.curtidas?.[currentUser.uid];
    const nome = currentUser.displayName || currentUser.email.split('@')[0];
    const update = {};
    if (liked) {
        update[`curtidas.${currentUser.uid}`] = firebase.firestore.FieldValue.delete();
    } else {
        update[`curtidas.${currentUser.uid}`] = nome;
    }
    try {
        await db.collection('postagens').doc(postId).update(update);
    } catch (err) {
        console.error(err);
        toast('Erro ao curtir.');
    }
}

function toggleComments(postId) {
    if (expandedComments.has(postId)) {
        expandedComments.delete(postId);
    } else {
        expandedComments.add(postId);
    }
    renderPosts();
}

async function submitComment(postId) {
    if (!db || !currentUser) return;
    const input = document.getElementById('comment-input-' + postId);
    const texto = input?.value.trim();
    if (!texto) return;

    const nome = currentUser.displayName || currentUser.email.split('@')[0];
    try {
        await db.collection('postagens').doc(postId).update({
            comentarios: firebase.firestore.FieldValue.arrayUnion({
                texto,
                autorUid: currentUser.uid,
                autorNome: nome,
                createdAt: new Date().toISOString(),
            }),
        });
        if (input) input.value = '';
    } catch (err) {
        console.error(err);
        toast('Erro ao comentar.');
    }
}

async function deletePost(postId) {
    if (!confirm('Remover esta postagem?')) return;
    try {
        await db.collection('postagens').doc(postId).delete();
        toast('Postagem removida.');
    } catch {
        toast('Erro ao remover.');
    }
}

async function quickStatusChange(bookId, newStatus) {
    if (!db) return;
    const today = new Date().toISOString().split('T')[0];
    const book  = books.find(b => b.id === bookId);
    const update = { status: newStatus };

    if (newStatus === 'lendo' && !book?.dataInicio) update.dataInicio = today;
    if (newStatus === 'lido'  && !book?.dataTermino) update.dataTermino = today;

    try {
        await db.collection('livros').doc(bookId).update(update);
        toast(newStatus === 'lido' ? 'Marcado como lido! ✅' : 'Boa leitura! 📖');
    } catch (err) {
        console.error(err);
        toast('Erro ao atualizar status.');
    }
}

// ── Calendar / Encontros ──────────────────────────────────────────────────────
function listenEncontros() {
    db.collection('encontros')
        .orderBy('data', 'asc')
        .onSnapshot(
            snap => {
                encontros = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderCalendario();
            },
            err => console.error(err)
        );
}

function renderCalendario() {
    const list  = document.getElementById('meetings-list');
    const empty = document.getElementById('meetings-empty');
    if (!list) return;

    if (!encontros.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    const today = new Date().toISOString().split('T')[0];
    const upcoming = encontros.filter(e => e.data >= today);
    const past     = encontros.filter(e => e.data < today).reverse();

    let html = '';

    if (upcoming.length) {
        html += `<div class="mb-3"><span class="text-xs font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-3 py-1 rounded-full">Próximos encontros</span></div>`;
        html += upcoming.map(e => meetingCard(e, false)).join('');
    }

    if (past.length) {
        html += `<div class="${upcoming.length ? 'mt-8' : ''} mb-3"><span class="text-xs font-bold uppercase tracking-wider text-stone-400 bg-stone-100 px-3 py-1 rounded-full">Encontros realizados</span></div>`;
        html += past.map(e => meetingCard(e, true)).join('');
    }

    list.innerHTML = html;
}

function meetingCard(e, isPast) {
    const book    = books.find(b => b.id === e.livroId);
    const dateObj = new Date(e.data + 'T12:00:00');
    const day     = String(dateObj.getDate()).padStart(2, '0');
    const months  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const month   = months[dateObj.getMonth()];
    const year    = dateObj.getFullYear();
    const weekday = weekdays[dateObj.getDay()];

    const canEdit = currentUser && (e.criadoPorUid === currentUser.uid);

    return `
    <div class="bg-white rounded-2xl shadow-sm border ${isPast ? 'border-stone-100' : 'border-rose-100'} p-4 book-card flex gap-4 ${isPast ? 'opacity-60' : ''}">
        <div class="flex-shrink-0 w-14 text-center">
            <div class="rounded-t-xl px-2 py-1" style="background: linear-gradient(135deg,#6b1219,#8b1a2e)">
                <p class="text-[10px] font-bold uppercase text-white">${month}</p>
            </div>
            <div class="border border-t-0 border-stone-200 rounded-b-xl px-2 py-1.5">
                <p class="text-2xl font-display font-bold text-stone-800 leading-none">${day}</p>
                <p class="text-[10px] text-stone-400">${weekday}</p>
            </div>
            <p class="text-[10px] text-stone-300 mt-1">${year}</p>
        </div>
        <div class="flex-1 min-w-0 flex gap-3">
            ${book ? bookCover(book, 'w-12 h-16 flex-shrink-0 rounded-lg shadow') : '<div class="w-12 h-16 bg-stone-100 rounded-lg flex-shrink-0"></div>'}
            <div class="flex-1 min-w-0">
                <h3 class="font-display text-base font-semibold text-stone-800 leading-tight line-clamp-1">
                    ${esc(e.livroTitulo || book?.titulo || 'Livro não encontrado')}
                </h3>
                ${e.horario ? `<p class="text-stone-500 text-xs font-medium mt-0.5">🕐 ${esc(e.horario)}</p>` : ''}
                ${e.capitulos ? `<p class="text-rose-700 text-sm font-medium mt-0.5">📖 ${esc(e.capitulos)}</p>` : ''}
                ${e.descricao  ? `<p class="text-stone-400 text-xs mt-1 line-clamp-2">${esc(e.descricao)}</p>` : ''}
                <p class="text-stone-300 text-[11px] mt-1">por ${esc(e.criadoPorNome || '')}</p>
            </div>
        </div>
        ${canEdit ? `
        <div class="flex-shrink-0 flex flex-col gap-1.5 ml-1">
            <button onclick="openEditMeeting('${e.id}')" class="text-stone-300 hover:text-rose-700 transition-colors text-sm" title="Editar">✏️</button>
            <button onclick="deleteMeeting('${e.id}')" class="text-stone-300 hover:text-red-400 transition-colors text-sm" title="Excluir">🗑️</button>
        </div>` : ''}
    </div>`;
}

function openMeetingModal(id) {
    editingMeetingId = id || null;
    document.getElementById('meeting-modal-title').textContent = id ? 'Editar Encontro' : 'Novo Encontro';

    const bookSelect = document.getElementById('m-livro');
    const sorted = [...books].sort((a, b) => {
        const order = { lendo: 0, proximo: 1, lido: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });
    const statusEmoji = { lendo: '📖', proximo: '🔜', lido: '✅' };
    bookSelect.innerHTML = '<option value="">Selecione um livro</option>' +
        sorted.map(b => `<option value="${b.id}">${statusEmoji[b.status] || ''} ${esc(b.titulo)}</option>`).join('');

    if (id) {
        const e = encontros.find(x => x.id === id);
        if (e) {
            document.getElementById('m-data').value      = e.data || '';
            document.getElementById('m-horario').value   = e.horario || '';
            document.getElementById('m-livro').value     = e.livroId || '';
            document.getElementById('m-capitulos').value = e.capitulos || '';
            document.getElementById('m-descricao').value = e.descricao || '';
        }
    } else {
        document.getElementById('meeting-form').reset();
    }

    show('meeting-modal');
}

function openEditMeeting(id) { openMeetingModal(id); }

function closeMeetingModal() { hide('meeting-modal'); }

async function saveMeeting(e) {
    e.preventDefault();
    if (!db || !currentUser) return;

    const btn = document.getElementById('meeting-save-btn');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const livroId = document.getElementById('m-livro').value;
    const book    = books.find(b => b.id === livroId);

    const data = {
        data:        document.getElementById('m-data').value,
        horario:     document.getElementById('m-horario').value,
        livroId,
        livroTitulo: book?.titulo || '',
        capitulos:   document.getElementById('m-capitulos').value.trim(),
        descricao:   document.getElementById('m-descricao').value.trim(),
    };

    try {
        if (editingMeetingId) {
            await db.collection('encontros').doc(editingMeetingId).update(data);
            toast('Encontro atualizado! ✅');
        } else {
            data.criadoPorUid  = currentUser.uid;
            data.criadoPorNome = currentUser.displayName || currentUser.email.split('@')[0];
            data.createdAt     = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('encontros').add(data);
            toast('Encontro agendado! 📅');
        }
        closeMeetingModal();
    } catch (err) {
        console.error(err);
        toast('Erro ao salvar encontro.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

async function deleteMeeting(id) {
    if (!confirm('Remover este encontro?')) return;
    try {
        await db.collection('encontros').doc(id).delete();
        toast('Encontro removido.');
    } catch {
        toast('Erro ao remover.');
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relTime(ts) {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'agora mesmo';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)} dias`;
    return date.toLocaleDateString('pt-BR');
}

function initials(nome) {
    if (!nome) return '?';
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function avatarColors(nome) {
    const palettes = [
        ['#fde8d8','#c04040'], ['#e8d8fe','#7040c0'], ['#d8fde8','#408040'],
        ['#d8e8fd','#4060c0'], ['#fdd8e8','#c04080'], ['#fefed8','#707020'],
    ];
    const idx = (nome || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palettes.length;
    return palettes[idx];
}

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(val) {
    if (!val) return '';
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
}

function fmtMonth(val) {
    if (!val) return '';
    const [y, m] = val.split('-');
    const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${names[parseInt(m) - 1]} / ${y}`;
}

function toast(msg, ms = 3000) {
    clearTimeout(toastTimer);
    document.getElementById('toast-msg').textContent = msg;
    show('toast');
    toastTimer = setTimeout(() => hide('toast'), ms);
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    showTab('inicio');
    initApp();
});
