// ==========================================
// CONFIGURATION SUPABASE
// ==========================================
const SUPABASE_URL = 'https://idrczecxknnczildpzyr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcmN6ZWN4a25uY3ppbGRwenlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MjQxMjEsImV4cCI6MjA4MjEwMDEyMX0.AoA2iWMz9erRSWbSO6FMdpdKwfFfRLIO5EA6nCpE9TA';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
// On essaie de récupérer le local au cas où le cloud est vide au premier lancement
let db = JSON.parse(localStorage.getItem('schefa_backup')) || { books: [], loans: [], goal: 20 };
let selectedAPI = null;
let currentLibTab = 'fini';
let onlyFavs = false;
let currentFriendPhoto = "https://cdn-icons-png.flaticon.com/512/1144/1144760.png";

// ==========================================
// SYNCHRONISATION CLOUD (CORRIGÉE)
// ==========================================

async function loadFromCloud() {
    try {
        const { data, error } = await supabaseClient
            .from('schefa_data')
            .select('content')
            .eq('id', 1)
            .single();

        if (data && data.content) {
            db = data.content;
            console.log("☁️ Données Cloud synchronisées");
        } else {
            console.log("🆕 Initialisation du profil Cloud avec les données locales...");
            await saveToCloud();
        }
    } catch (e) {
        console.error("Erreur Cloud:", e);
    }
    updateAll(false); // On force l'affichage
}

async function saveToCloud() {
    try {
        await supabaseClient
            .from('schefa_data')
            .upsert({ id: 1, content: db });
    } catch (e) {
        console.error("Erreur sauvegarde:", e);
    }
}

function updateAll(shouldSaveCloud = true) {
    renderHome();
    renderBooks();
    localStorage.setItem('schefa_backup', JSON.stringify(db));
    if (shouldSaveCloud) saveToCloud();
}

// ==========================================
// NAVIGATION ET MODALES (FIX DU BOUTON OK)
// ==========================================

function enterApp() {
    document.getElementById('welcome-screen').style.opacity = '0';
    setTimeout(() => document.getElementById('welcome-screen').style.display = 'none', 700);
    updateAll(false);
}

function openInputModal(title, defaultValue, onConfirm) {
    document.getElementById('modal-title').innerText = title;
    const field = document.getElementById('modal-field');
    field.value = defaultValue;
    
    document.getElementById('input-modal').classList.remove('hidden');
    
    const confirmBtn = document.getElementById('modal-confirm-btn');
    confirmBtn.onclick = null; // Nettoyage
    confirmBtn.onclick = () => {
        const val = parseInt(document.getElementById('modal-field').value);
        if (!isNaN(val)) {
            onConfirm(val);
            closeInputModal();
        }
    };
}

function closeInputModal() {
    document.getElementById('input-modal').classList.add('hidden');
}

function openGoalModal() {
    openInputModal("Objectif annuel", db.goal, (v) => {
        db.goal = v;
        updateAll();
    });
}

function openPageUpdate(id, cur) {
    openInputModal("À quelle page es-tu ?", cur, (v) => {
        const b = db.books.find(x => x.id === id);
        if(b) {
            b.currentPage = v;
            if(b.currentPage >= b.pages) finishBook(id);
            else updateAll();
        }
    });
}

// ==========================================
// FORMULAIRE INTELLIGENT
// ==========================================

function adaptForm() {
    const status = document.getElementById('status-select').value;
    const fields = {
        archive: document.getElementById('archive-fields'),
        source: document.getElementById('field-source'),
        page: document.getElementById('field-page')
    };
    
    Object.values(fields).forEach(f => f.classList.add('hidden'));

    if (status === 'fini') fields.archive.classList.remove('hidden');
    else if (status === 'en-cours') fields.page.classList.remove('hidden');
    else fields.source.classList.remove('hidden');
}

function openForm() {
    document.getElementById('form-overlay').classList.remove('hidden');
    const sel = document.getElementById('status-select');
    sel.value = (currentLibTab === 'pile') ? 'pile' : (currentLibTab === 'en-cours' ? 'en-cours' : 'fini');
    adaptForm();
}

function closeForm() {
    document.getElementById('form-overlay').classList.add('hidden');
    selectedAPI = null;
    document.getElementById('title-input').value = "";
    document.getElementById('book-details-preview').classList.add('hidden');
}

// ==========================================
// API ET RECHERCHE
// ==========================================

async function fetchSuggestions(query) {
    if(query.length < 3) return;
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
    const data = await res.json();
    const sugg = document.getElementById('suggestions');
    if(!data.items) return;
    
    sugg.innerHTML = data.items.map(item => `
        <div onclick="selectFromAPI('${item.id}')" class="p-4 flex gap-4 items-center border-b cursor-pointer hover:bg-gray-50 text-left text-black">
            <img src="${item.volumeInfo.imageLinks?.thumbnail || ''}" class="w-8 h-12 object-cover rounded shadow-sm">
            <div class="overflow-hidden">
                <p class="text-xs font-bold truncate">${item.volumeInfo.title}</p>
                <p class="text-[10px] text-gray-400">${item.volumeInfo.authors?.[0] || '?'}</p>
            </div>
        </div>`).join('');
    sugg.classList.remove('hidden');
    window.lastData = data.items;
}

function selectFromAPI(id) {
    const item = window.lastData.find(i => i.id === id);
    const info = item.volumeInfo;
    
    // On analyse tout le texte disponible pour trouver des mots clés
    const categories = info.categories ? info.categories.join(' ') : '';
    const description = info.description || '';
    const fullText = (info.title + ' ' + categories + ' ' + description).toLowerCase();
    
    let genre = "Roman"; // Par défaut
    
    if (fullText.match(/fantast|fantasy|magic|sorcier|dragon|fée|elfe/i)) genre = "Fantasy";
    else if (fullText.match(/thrill|suspense|tension|crime|meurtre|assassin/i)) genre = "Thriller";
    else if (fullText.match(/romance|amour|passion|coeur|érot/i)) genre = "Romance";
    else if (fullText.match(/polic|enquête|mystère|detective|menez/i)) genre = "Policier";
    else if (fullText.match(/horreur|peur|effroi|ghost|fantôme|sanglant/i)) genre = "Horreur";
    else if (fullText.match(/biographie|autobiographie|vécu|mémoires/i)) genre = "Biographie";
    else if (fullText.match(/manga|bd|comics|illustration/i)) genre = "Manga / BD";

    selectedAPI = { 
        title: info.title, 
        author: info.authors ? info.authors.join(', ') : '?', 
        cover: info.imageLinks?.thumbnail?.replace('http:','https:') || "https://via.placeholder.com/150", 
        pages: info.pageCount || 300, 
        description: info.description || "", 
        genre: genre, 
        id: Date.now() 
    };

    document.getElementById('title-input').value = info.title;
    document.getElementById('genre-input').value = genre; // Remplit automatiquement le champ genre
    document.getElementById('suggestions').classList.add('hidden');
    const preview = document.getElementById('book-details-preview');
    preview.classList.remove('hidden');
    preview.innerHTML = `<img src="${selectedAPI.cover}" class="w-10 h-14 rounded shadow"> <span class="text-black font-bold">${info.title}</span>`;
}

function saveBook() {
    const title = document.getElementById('title-input').value;
    if(!title) return;
    const status = document.getElementById('status-select').value;
    
    const book = selectedAPI || { 
        title, author: "?", cover: "https://via.placeholder.com/150", 
        pages: 300, description: "Manuel", genre: document.getElementById('genre-input').value || "Roman", id: Date.now() 
    };

    book.status = status;
    book.genre = document.getElementById('genre-input').value;

    if (status === 'fini') {
        book.review = document.getElementById('review-input').value;
        book.nul = document.getElementById('nul-input').value;
        book.isFav = document.getElementById('fav-input').checked;
        book.currentPage = book.pages;
    } else if (status === 'en-cours') {
        book.currentPage = parseInt(document.getElementById('start-page-input').value) || 0;
    } else {
        book.source = document.getElementById('source-input').value;
    }

    db.books.unshift(book);
    closeForm();
    updateAll();
}

// ==========================================
// RENDUS
// ==========================================

function renderHome() {
    // 1. GESTION DES LECTURES EN COURS (MULTIPLE)
    const readingBooks = db.books.filter(b => b.status === 'en-cours');
    const container = document.getElementById('now-reading-content');
    
    if(readingBooks.length > 0) {
        container.innerHTML = readingBooks.map(reading => {
            const prog = Math.round((reading.currentPage / reading.pages) * 100) || 0;
            return `
            <div class="flex-shrink-0 w-[85%] bg-white p-6 rounded-[30px] border border-gray-100 shadow-sm flex gap-4 items-center animate-view">
                <img src="${reading.cover}" class="w-14 h-20 object-cover rounded shadow-md">
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-[13px] text-black leading-tight truncate mr-2">${reading.title}</h4>
                        <button onclick="finishBook(${reading.id})" class="text-[7px] bg-green-50 text-green-600 px-2 py-1 rounded font-bold uppercase whitespace-nowrap">Fini !</button>
                    </div>
                    <div class="flex justify-between text-[8px] font-bold mb-1 uppercase text-gray-400">
                        <span>${prog}%</span>
                        <span>Page ${reading.currentPage}</span>
                    </div>
                    <div class="progress-bar mb-3"><div class="progress-fill" style="width: ${prog}%"></div></div>
                    <button onclick="openPageUpdate(${reading.id}, ${reading.currentPage})" class="text-[9px] font-bold border-b border-black text-black italic uppercase">Mettre à jour</button>
                </div>
            </div>`;
        }).join('');
    } else {
        container.innerHTML = `<div class="bg-white p-6 rounded-[30px] border border-gray-100 w-full text-center italic text-xs text-gray-400">Aucune lecture active pour le moment.</div>`;
    }

    // --- LE RESTE DE LA FONCTION RESTE PAREIL ---
    const finished = db.books.filter(b => b.status === 'fini');
    document.getElementById('goal-text').innerText = `${finished.length} / ${db.goal} livres`;
    const goalPercent = Math.min((finished.length / db.goal) * 100, 100);
    document.getElementById('goal-fill').style.width = `${goalPercent}%`;

    const pagesFinished = finished.reduce((acc, b) => acc + (parseInt(b.pages) || 0), 0);
    const pagesReading = readingBooks.reduce((acc, b) => acc + (parseInt(b.currentPage) || 0), 0);
    const totalPages = pagesFinished + pagesReading;
    document.getElementById('stat-total-pages').innerText = totalPages.toLocaleString();

    document.getElementById('stat-wishlist-count').innerText = db.books.filter(b => b.status === 'pile').length;
    const favCount = finished.filter(b => b.isFav).length;
    document.getElementById('stat-avg-rating').innerText = finished.length > 0 ? Math.round((favCount / finished.length) * 100) + "%" : "0%";
    const longest = finished.reduce((max, b) => (parseInt(b.pages) > (parseInt(max.pages) || 0)) ? b : max, {});
    document.getElementById('stat-longest-book').innerText = longest.pages ? longest.pages + " p" : "—";

    document.getElementById('loans-list').innerHTML = db.loans.length === 0 ? `<p class="text-[10px] italic text-gray-300">Aucun livre prêté.</p>` : db.loans.map((l, i) => `
        <div class="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-gray-50 animate-view">
            <div class="flex items-center gap-3">
                <img src="${l.friendPhoto}" class="w-10 h-10 rounded-full object-cover border border-gray-100 shadow-sm">
                <div class="text-[11px] font-bold text-black text-left">
                    <p>${l.who}</p>
                    <p class="text-gray-400 font-light italic">${l.book}</p>
                </div>
            </div>
            <button onclick="if(confirm('Livre rendu ?')){db.loans.splice(${i}, 1); updateAll();}" class="text-gray-300 hover:text-red-400 transition-colors">✕</button>
        </div>`).join('');
}

function renderBooks() {
    const list = document.getElementById('book-list');
    const search = document.getElementById('searchBar').value.toLowerCase();
    const genreFilter = document.getElementById('filter-genre-lib').value;
    const sortOrder = document.getElementById('sort-order-lib').value;

    // 1. Filtrage
    let filtered = db.books.filter(b => {
        const matchesTab = (b.status === currentLibTab);
        const matchesSearch = b.title.toLowerCase().includes(search) || b.author.toLowerCase().includes(search);
        const matchesGenre = (genreFilter === 'tous' || b.genre === genreFilter);
        const matchesFav = onlyFavs ? b.isFav === true : true;
        return matchesTab && matchesSearch && matchesGenre && matchesFav;
    });

    // 2. Tri (C'est ici que ça change)
    if (sortOrder === 'titre') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOrder === 'recent') {
        filtered.sort((a, b) => b.id - a.id); // Les plus récents ajoutés en premier
    }

    // 3. Affichage
    if (filtered.length === 0) {
        list.innerHTML = `<p class="text-center text-xs italic text-gray-300 py-10">Aucun livre trouvé dans cette catégorie.</p>`;
        return;
    }

    list.innerHTML = filtered.map(b => `
        <div class="flex gap-6 items-center animate-view text-left">
            <div onclick="showDetails(${b.id})" class="w-20 h-32 flex-shrink-0 book-card cursor-pointer relative">
                <div class="spine"></div>
                <img src="${b.cover}" class="w-full h-full object-cover">
                ${b.isFav ? '<div class="absolute top-1 right-1 text-xs drop-shadow-md">❤️</div>' : ''}
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                    ${b.status === 'pile' ? 'SOURCE: ' + (b.source || '?') : b.genre}
                </p>
                <h4 class="serif text-xl leading-tight mb-2 truncate italic cursor-pointer text-black" onclick="showDetails(${b.id})">${b.title}</h4>
                <div class="flex gap-4">
                    ${b.status === 'pile' ? `
                        <button onclick="startReading(${b.id})" class="text-[9px] font-bold uppercase text-blue-500">Lire</button>
                        <a href="https://www.amazon.fr/s?k=${encodeURIComponent(b.title)}" target="_blank" class="text-[9px] font-bold uppercase text-gray-400 underline">Amazon</a>
                    ` : ''}
                    <button onclick="if(confirm('Supprimer ?')){db.books = db.books.filter(x => x.id !== ${b.id}); updateAll();}" class="text-[9px] font-bold uppercase text-red-200">Supprimer</button>
                </div>
            </div>
        </div>`).join('');
}

function showDetails(id) {
    const b = db.books.find(x => x.id === id);
    const modal = document.getElementById('details-modal');
    modal.innerHTML = `
        <div class="p-8 pb-32 max-w-2xl mx-auto text-left">
            <button onclick="document.getElementById('details-modal').classList.add('hidden')" class="text-xs font-bold mb-10 uppercase text-gray-400">← Fermer</button>
            <div class="flex flex-col md:flex-row gap-10 mb-12">
                <div class="w-48 h-72 mx-auto md:mx-0 book-card shadow-2xl relative">
                    <div class="spine"></div>
                    <img src="${b.cover}" class="w-full h-full object-cover">
                    ${b.isFav ? '<div class="absolute top-2 right-2 text-2xl">❤️</div>' : ''}
                </div>
                <div class="flex-1 text-center md:text-left">
                    <p class="text-[9px] text-gray-400 uppercase tracking-widest mb-4">${b.genre}</p>
                    <h2 class="serif text-4xl italic mb-6 text-black leading-tight">${b.title}</h2>
                    <p class="text-gray-400 text-xs uppercase tracking-widest">${b.author}</p>
                </div>
            </div>
            <div class="space-y-8">
                <div><h3 class="serif text-2xl italic border-b pb-2 mb-4 text-black text-left">Résumé</h3><p class="text-sm text-gray-500 leading-relaxed font-light">${b.description || '...'}</p></div>
                ${b.status === 'fini' ? `<div class="grid grid-cols-2 gap-4">
                    <div class="bg-green-50 p-6 rounded-[30px] italic text-xs leading-relaxed text-green-900">"${b.review || '...'}"</div>
                    <div class="bg-red-50 p-6 rounded-[30px] italic text-xs leading-relaxed text-red-900">"${b.nul || '...'}"</div>
                </div>` : ''}
            </div>
        </div>`;
    modal.classList.remove('hidden');
}

// --- UTILITAIRES ---
function switchTab(tab) {
    ['home', 'lib'].forEach(t => { document.getElementById(`view-${t}`).classList.add('hidden'); document.getElementById(`nav-${t}`).classList.add('opacity-30'); });
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    document.getElementById(`nav-${tab}`).classList.remove('opacity-30');
}

function setLibTab(tab) {
    currentLibTab = tab;
    ['fini', 'en-cours', 'pile'].forEach(t => { document.getElementById(`tab-${t}`).className = "text-[10px] font-bold uppercase pb-2 text-gray-300"; });
    document.getElementById(`tab-${tab}`).className = "text-[10px] font-bold uppercase pb-2 text-black border-b-2 border-black";
    const f = document.getElementById('filter-fav');
    if(tab === 'fini') f.classList.remove('hidden'); else { f.classList.add('hidden'); onlyFavs = false; }
    renderBooks();
}

function toggleFavFilter() {
    onlyFavs = !onlyFavs;
    document.getElementById('filter-fav').className = onlyFavs ? "bg-black text-white text-[9px] uppercase px-4 py-2 rounded-full font-bold shadow-sm" : "bg-white text-black text-[9px] uppercase px-4 py-2 rounded-full border border-gray-100 font-bold shadow-sm";
    renderBooks();
}

function finishBook(id) { 
    const b = db.books.find(x => x.id === id); 
    db.books = db.books.filter(x => x.id !== id); 
    document.getElementById('form-overlay').classList.remove('hidden'); 
    document.getElementById('status-select').value = 'fini'; 
    document.getElementById('title-input').value = b.title; 
    selectedAPI = b; 
    adaptForm(); 
}

function startReading(id) { db.books.find(x => x.id === id).status = 'en-cours'; updateAll(); }

// PRÊTS
function addLoan() { document.getElementById('loan-form-modal').classList.remove('hidden'); }
function closeLoanForm() { document.getElementById('loan-form-modal').classList.add('hidden'); }
function previewFriendPhoto(input) { if (input.files && input.files[0]) { let r = new FileReader(); r.onload = (e) => { currentFriendPhoto = e.target.result; const p = document.getElementById('friend-photo-preview'); p.style.backgroundImage = `url(${e.target.result})`; p.classList.remove('hidden'); }; r.readAsDataURL(input.files[0]); } }
async function fetchLoanSuggestions(q) { if(q.length < 3) return; const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=3`); const data = await res.json(); document.getElementById('loan-suggestions').innerHTML = data.items.map(item => `<div onclick="document.getElementById('loan-book-input').value='${item.volumeInfo.title.replace(/'/g, "\\'")}';document.getElementById('loan-suggestions').classList.add('hidden');" class="p-3 border-b text-xs text-black cursor-pointer bg-white">${item.volumeInfo.title}</div>`).join(''); document.getElementById('loan-suggestions').classList.remove('hidden'); }
function saveLoan() { const w = document.getElementById('loan-who-input').value; const b = document.getElementById('loan-book-input').value; if(w && b) db.loans.push({ who: w, book: b, friendPhoto: currentFriendPhoto }); closeLoanForm(); updateAll(); }

// DÉMARRAGE
document.addEventListener('DOMContentLoaded', loadFromCloud);