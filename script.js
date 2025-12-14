/**
 * Bupyeong Seo Elementary News - Main Logic
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- Selectors ---
    const newsGrid = document.getElementById('newsGrid');
    const heroSection = document.getElementById('heroSection');

    // Writer Modal Selectors
    const openEditorBtn = document.getElementById('openEditorBtn');
    const closeEditorBtn = document.getElementById('closeEditorBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const editorModal = document.getElementById('editorModal');
    const newsForm = document.getElementById('newsForm');
    const dropZone = document.getElementById('dropZone');
    const newsImageInput = document.getElementById('newsImage');
    const imagePreview = document.getElementById('imagePreview');
    const currentDateDisplay = document.getElementById('currentDate');

    // Reader Modal Selectors
    const readerModal = document.getElementById('readerModal');
    const closeReaderBtn = document.getElementById('closeReaderBtn');
    const closeReaderBtnAlt = document.getElementById('closeReaderBtnAlt');
    const readCategory = document.getElementById('readCategory');
    const readDate = document.getElementById('readDate');
    const readTitle = document.getElementById('readTitle');
    const readReporter = document.getElementById('readReporter');
    const readImage = document.getElementById('readImage');
    const readContent = document.getElementById('readContent');

    // --- State Management ---
    let newsData = JSON.parse(localStorage.getItem('bupyeongNewsData')) || [];

    // --- Initialization ---
    init();

    function init() {
        renderNews();
        updateDate();
        setupEventListeners();
    }

    function updateDate() {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        currentDateDisplay.textContent = now.toLocaleDateString('ko-KR', options);
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        // Writer Modal Controls
        openEditorBtn.addEventListener('click', () => openModal(editorModal));
        closeEditorBtn.addEventListener('click', () => closeModal(editorModal));
        cancelBtn.addEventListener('click', () => closeModal(editorModal));

        // Reader Modal Controls
        closeReaderBtn.addEventListener('click', () => closeModal(readerModal));
        closeReaderBtnAlt.addEventListener('click', () => closeModal(readerModal));

        // Close modal when clicking outside
        editorModal.addEventListener('click', (e) => {
            if (e.target === editorModal) closeModal(editorModal);
        });
        readerModal.addEventListener('click', (e) => {
            if (e.target === readerModal) closeModal(readerModal);
        });

        // Image Upload Handling
        dropZone.addEventListener('click', () => newsImageInput.click());

        // Drag & Drop effects
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--primary-color)';
            dropZone.style.background = '#f0f8ff';
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#ddd';
            dropZone.style.background = '#fafafa';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#ddd';
            dropZone.style.background = '#fafafa';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleImageFile(file);
            }
        });

        newsImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleImageFile(file);
        });

        // Form Submission
        newsForm.addEventListener('submit', handleFormSubmit);
    }

    // --- Core Functions ---

    function openModal(modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }

    function closeModal(modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        if (modal === editorModal) resetForm();
    }

    function openReader(newsId) {
        const article = newsData.find(item => item.id === newsId);
        if (!article) return;

        readCategory.textContent = article.category;
        readDate.textContent = article.date;
        readTitle.textContent = article.title;
        readReporter.textContent = `${article.reporter} 기자`;
        readContent.textContent = article.content;

        if (article.image) {
            readImage.src = article.image;
            readImage.style.display = 'block';
        } else {
            readImage.style.display = 'none';
        }

        openModal(readerModal);
    }

    function handleImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    function handleFormSubmit(e) {
        e.preventDefault();

        const title = document.getElementById('newsTitle').value;
        const reporter = document.getElementById('newsReporter').value;
        const category = document.getElementById('newsCategory').value;
        const content = document.getElementById('newsContent').value;
        const imageSrc = imagePreview.src || ''; // Fallback if no image

        if (!title || !reporter || !content) {
            alert('모든 필수 정보를 입력해주세요!');
            return;
        }

        const newArticle = {
            id: Date.now(), // Simple unique ID
            title,
            reporter,
            category,
            content,
            image: imageSrc,
            date: new Date().toLocaleDateString('ko-KR'),
            timestamp: Date.now()
        };

        saveNews(newArticle);
        closeModal(editorModal);
        renderNews();

        // Animation feedback
        alert('기사가 성공적으로 발행되었습니다!');
    }

    function saveNews(article) {
        newsData.unshift(article); // Add to beginning (newest first)
        localStorage.setItem('bupyeongNewsData', JSON.stringify(newsData));
    }

    function renderNews() {
        // Clear current content
        newsGrid.innerHTML = '';

        if (newsData.length === 0) {
            heroSection.innerHTML = `
                <div class="hero-placeholder">
                    <div class="hero-content">
                        <span class="category-tag">안내</span>
                        <h2>아직 등록된 뉴스가 없습니다.</h2>
                        <p>첫 번째 기자가 되어 학교의 소식을 전해주세요!</p>
                    </div>
                </div>
            `;
            return;
        }

        // 1. Featured Article (The most recent one)
        const featured = newsData[0];

        heroSection.innerHTML = ''; // Clear fallback

        // Create Hero Element with Click Listener
        const heroWrapper = document.createElement('div');
        heroWrapper.style.cursor = 'pointer';
        heroWrapper.style.width = '100%';
        heroWrapper.style.height = '100%';
        heroWrapper.onclick = () => openReader(featured.id);

        const heroImg = document.createElement('img');
        if (featured.image) {
            heroImg.src = featured.image;
        } else {
            heroImg.src = 'https://via.placeholder.com/1200x600?text=No+Image';
        }

        const heroContentDiv = document.createElement('div');
        heroContentDiv.className = 'hero-content';
        heroContentDiv.innerHTML = `
            <span class="category-tag">${featured.category}</span>
            <h2>${featured.title}</h2>
            <p>${featured.date} | ${featured.reporter} 기자</p>
        `;

        heroWrapper.appendChild(heroImg);
        heroWrapper.appendChild(heroContentDiv);
        heroSection.appendChild(heroWrapper);


        // 2. The Rest of the News (Grid)
        const restNews = newsData.slice(1);

        if (restNews.length === 0) {
            newsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 20px; color: #777;">다음 뉴스를 기다리고 있습니다...</p>';
        } else {
            restNews.forEach(news => {
                const card = createNewsCard(news);
                newsGrid.appendChild(card);
            });
        }
    }

    function createNewsCard(news) {
        const article = document.createElement('article');
        article.className = 'news-card';
        article.style.cursor = 'pointer'; // Make it look clickable
        article.onclick = () => openReader(news.id); // Add click handler

        const imgDisplay = news.image ? `<img src="${news.image}" alt="${news.title}">` : '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#eee; color:#aaa;"><i class="fa-solid fa-newspaper fa-3x"></i></div>';

        article.innerHTML = `
            <div class="news-thumb">
                ${imgDisplay}
            </div>
            <div class="news-body">
                <div class="news-meta">
                    <span style="color:var(--accent-color); font-weight:700;">${news.category}</span>
                    <span>${news.date}</span>
                </div>
                <h4 class="news-title">${news.title}</h4>
                <p class="news-excerpt">${news.content}</p>
                <div style="margin-top:auto; padding-top:15px; font-size:0.85rem; font-weight:600;">
                    <i class="fa-solid fa-user-pen"></i> ${news.reporter} 기자
                </div>
            </div>
        `;

        return article;
    }

    function resetForm() {
        newsForm.reset();
        imagePreview.src = '';
        imagePreview.classList.add('hidden');
        dropZone.style.borderColor = '#ddd';
        dropZone.style.background = '#fafafa';
    }

});
