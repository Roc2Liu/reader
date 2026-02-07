// 性能优化：使用requestAnimationFrame进行动画
const raf = window.requestAnimationFrame || 
            window.webkitRequestAnimationFrame || 
            window.mozRequestAnimationFrame || 
            window.msRequestAnimationFrame || 
            function(callback) { return setTimeout(callback, 1000/60); };

// 全局变量
const APP = {
    currentNovel: null,
    chapters: [],
    currentChapterIndex: 0,
    scrollPosition: 0,
    fontSize: 16,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.6,
    paragraphSpacing: 1.0,
    customFont: null,
    settingsPanelOpen: false,
    chaptersPanelOpen: false,
    isAnimating: false,
    observer: null,
    db: null,
    indexedDBName: 'NovelReaderDB',
    indexedDBVersion: 2,
    titleAnimationTimeout: null,
    isTitleScrolling: false,
    // 性能优化：防抖计时器
    debounceTimers: new Map()
};

// DOM元素引用
const dom = {
    settingsMask: document.getElementById('settingsMask'),
    chaptersMask: document.getElementById('chaptersMask'),
    contentContainer: document.getElementById('contentContainer'),
    content: document.getElementById('content'),
    fileUploadArea: document.getElementById('fileUploadArea'),
    fileInput: document.getElementById('fileInput'),
    selectFileBtn: document.getElementById('selectFileBtn'),
    chapterNavBtn: document.getElementById('chapterNavBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    pageControlGroup: document.getElementById('pageControlGroup'),
    settingsPanel: document.getElementById('settingsPanel'),
    chaptersPanel: document.getElementById('chaptersPanel'),
    settingsClose: document.getElementById('settingsClose'),
    chaptersClose: document.getElementById('chaptersClose'),
    chaptersList: document.getElementById('chaptersList'),
    chaptersCount: document.getElementById('chaptersCount'),
    fontSize: document.getElementById('fontSize'),
    fontSizeValue: document.getElementById('fontSizeValue'),
    fontWeight: document.getElementById('fontWeight'),
    fontWeightValue: document.getElementById('fontWeightValue'),
    letterSpacing: document.getElementById('letterSpacing'),
    letterSpacingValue: document.getElementById('letterSpacingValue'),
    lineHeight: document.getElementById('lineHeight'),
    lineHeightValue: document.getElementById('lineHeightValue'),
    paragraphSpacing: document.getElementById('paragraphSpacing'),
    paragraphSpacingValue: document.getElementById('paragraphSpacingValue'),
    resetTextStyle: document.getElementById('resetTextStyle'),
    resetParagraphStyle: document.getElementById('resetParagraphStyle'),
    resetFont: document.getElementById('resetFont'),
    resetAllStyles: document.getElementById('resetAllStyles'),
    fontUpload: document.getElementById('fontUpload'),
    fontPreview: document.getElementById('fontPreview'),
    fontPreviewText: document.getElementById('fontPreviewText'),
    fontPreviewName: document.getElementById('fontPreviewName'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    toast: document.getElementById('toast'),
    clearNovelData: document.getElementById('clearNovelData'),
    clearSettings: document.getElementById('clearSettings'),
    exportData: document.getElementById('exportData'),
    importData: document.getElementById('importData'),
    storageInfo: document.getElementById('storageInfo'),
    historyList: document.getElementById('historyList'),
    historyItems: document.getElementById('historyItems'),
    chapterTitle: document.getElementById('chapterTitle')
};

// 防抖函数 - 性能优化
function debounce(func, wait, key) {
    return function(...args) {
        if (APP.debounceTimers.has(key)) {
            clearTimeout(APP.debounceTimers.get(key));
        }
        
        const timer = setTimeout(() => {
            func.apply(this, args);
            APP.debounceTimers.delete(key);
        }, wait);
        
        APP.debounceTimers.set(key, timer);
    };
}

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    await initDatabase();
    await loadSettings();
    await loadReadingHistory();
    initIntersectionObserver();
    updateStorageInfo();
    
    // 初始状态
    dom.settingsPanel.classList.add('collapsed');
    dom.chaptersPanel.classList.add('collapsed');
    
    // 初始化字体预览
    updateFontPreview();
});

// 初始化事件监听器
function initEventListeners() {
    // 文件上传相关
    dom.selectFileBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleFileSelect);
    
    // 拖放文件支持
    dom.fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.fileUploadArea.style.borderColor = 'rgba(52, 152, 219, 0.5)';
        dom.fileUploadArea.style.background = 'rgba(255, 255, 255, 0.8)';
    });
    
    dom.fileUploadArea.addEventListener('dragleave', () => {
        dom.fileUploadArea.style.borderColor = 'rgba(52, 152, 219, 0.2)';
        dom.fileUploadArea.style.background = 'rgba(255, 255, 255, 0.5)';
    });
    
    dom.fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.fileUploadArea.style.borderColor = 'rgba(52, 152, 219, 0.2)';
        dom.fileUploadArea.style.background = 'rgba(255, 255, 255, 0.5)';
        
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect({ target: { files: e.dataTransfer.files } });
        }
    });
    
    // 控制按钮事件
    dom.chapterNavBtn.addEventListener('click', toggleChaptersPanel);
    dom.settingsBtn.addEventListener('click', toggleSettingsPanel);
    dom.prevPageBtn.addEventListener('click', prevChapter);
    dom.nextPageBtn.addEventListener('click', nextChapter);
    
    // 关闭面板按钮
    dom.settingsClose.addEventListener('click', toggleSettingsPanel);
    dom.chaptersClose.addEventListener('click', toggleChaptersPanel);
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') prevChapter();
        if (e.key === 'ArrowRight') nextChapter();
        if (e.key === 'Escape') {
            if (APP.settingsPanelOpen) toggleSettingsPanel();
            if (APP.chaptersPanelOpen) toggleChaptersPanel();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            toggleSettingsPanel();
        }
    });
    
    // 点击遮罩关闭面板
    dom.settingsMask.addEventListener('click', () => {
        if (APP.settingsPanelOpen) {
            toggleSettingsPanel();
        }
    });
    
    dom.chaptersMask.addEventListener('click', () => {
        if (APP.chaptersPanelOpen) {
            toggleChaptersPanel();
        }
    });
    
    // 样式控制 - 使用防抖
    dom.fontSize.addEventListener('input', debounce(updateFontSize, 100, 'fontSize'));
    dom.fontWeight.addEventListener('input', debounce(updateFontWeight, 100, 'fontWeight'));
    dom.letterSpacing.addEventListener('input', debounce(updateLetterSpacing, 100, 'letterSpacing'));
    dom.lineHeight.addEventListener('input', debounce(updateLineHeight, 100, 'lineHeight'));
    dom.paragraphSpacing.addEventListener('input', debounce(updateParagraphSpacing, 100, 'paragraphSpacing'));
    
    // 重置按钮
    dom.resetTextStyle.addEventListener('click', resetTextStyle);
    dom.resetParagraphStyle.addEventListener('click', resetParagraphStyle);
    dom.resetFont.addEventListener('click', resetFontStyle);
    dom.resetAllStyles.addEventListener('click', resetAllStyles);
    
    // 字体上传
    dom.fontUpload.addEventListener('change', handleFontUpload);
    
    // 内容区域滚动保存 - 使用防抖
    dom.contentContainer.addEventListener('scroll', debounce(saveScrollPosition, 500, 'scroll'));
    
    // 存储管理
    dom.clearNovelData.addEventListener('click', clearNovelData);
    dom.clearSettings.addEventListener('click', clearSettings);
    dom.exportData.addEventListener('click', exportAllData);
    
    // 导入功能通过隐藏的文件输入实现
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json';
    importInput.style.display = 'none';
    document.body.appendChild(importInput);
    
    dom.importData.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', handleDataImport);
    
    // 章节标题悬停事件
    dom.chapterTitle.addEventListener('mouseenter', () => {
        if (dom.chapterTitle.classList.contains('scrollable')) {
            dom.chapterTitle.style.animationPlayState = 'paused';
        }
    });
    
    dom.chapterTitle.addEventListener('mouseleave', () => {
        if (dom.chapterTitle.classList.contains('scrollable')) {
            dom.chapterTitle.style.animationPlayState = 'running';
        }
    });
    
    // 性能优化：监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            saveProgress();
        }
    });
    
    // 页面卸载前保存数据
    window.addEventListener('beforeunload', () => {
        saveProgress();
    });
}

// 初始化IndexedDB数据库
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(APP.indexedDBName, APP.indexedDBVersion);
        
        request.onerror = (event) => {
            console.error('IndexedDB打开失败:', event.target.error);
            showToast('本地存储初始化失败，部分功能可能不可用', 'error');
            reject(event.target.error);
        };
        
        request.onsuccess = (event) => {
            APP.db = event.target.result;
            console.log('IndexedDB打开成功');
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('novels')) {
                const novelsStore = db.createObjectStore('novels', { keyPath: 'id' });
                novelsStore.createIndex('name', 'name', { unique: false });
                novelsStore.createIndex('lastRead', 'lastRead', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('progress')) {
                const progressStore = db.createObjectStore('progress', { keyPath: 'novelId' });
                progressStore.createIndex('lastRead', 'lastRead', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('fonts')) {
                db.createObjectStore('fonts', { keyPath: 'id' });
            }
            
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
            
            console.log('IndexedDB结构创建/更新完成');
        };
    });
}

// 混合存储方案
class StorageManager {
    // 判断数据大小，选择存储方案
    static shouldUseIndexedDB(data) {
        const dataSize = JSON.stringify(data).length;
        return dataSize > 1024 * 1024; // > 1MB 使用 IndexedDB
    }
    
    // 保存小说数据
    static async saveNovel(novel) {
        try {
            const contentSize = JSON.stringify(novel.chapters).length;
            
            if (contentSize > 1024 * 1024) {
                return await this.saveToIndexedDB('novels', novel);
            } else {
                return this.saveToLocalStorage(`novel_${novel.id}`, novel);
            }
        } catch (error) {
            console.error('保存小说失败:', error);
            throw error;
        }
    }
    
    // 保存阅读进度
    static async saveProgress(novelId, chapterIndex, scrollTop) {
        const progress = {
            novelId: novelId,
            chapterIndex: chapterIndex,
            scrollPosition: scrollTop,
            lastRead: new Date().toISOString()
        };
        
        try {
            return this.saveToLocalStorage(`progress_${novelId}`, progress);
        } catch (error) {
            console.error('保存进度失败:', error);
            throw error;
        }
    }
    
    // 保存设置
    static async saveSettings(settings) {
        try {
            return this.saveToLocalStorage('settings', settings);
        } catch (error) {
            console.error('保存设置失败:', error);
            throw error;
        }
    }
    
    // 保存字体
    static async saveFont(font) {
        try {
            return await this.saveToIndexedDB('fonts', font);
        } catch (error) {
            console.error('保存字体失败:', error);
            throw error;
        }
    }
    
    // 加载小说数据
    static async loadNovel(novelId) {
        try {
            const novel = this.loadFromLocalStorage(`novel_${novelId}`);
            if (novel) return novel;
            
            return await this.loadFromIndexedDB('novels', novelId);
        } catch (error) {
            console.error('加载小说失败:', error);
            return null;
        }
    }
    
    // 加载所有小说信息（仅元数据）
    static async loadAllNovels() {
        try {
            const novels = [];
            
            // 从 LocalStorage 加载
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('novel_')) {
                    const novel = JSON.parse(localStorage.getItem(key));
                    if (novel && novel.name) {
                        novels.push({
                            id: novel.id,
                            name: novel.name,
                            size: novel.size,
                            lastModified: novel.lastModified,
                            chaptersCount: novel.chapters ? novel.chapters.length : 0,
                            storageType: 'localStorage'
                        });
                    }
                }
            }
            
            // 从 IndexedDB 加载
            if (APP.db) {
                const transaction = APP.db.transaction(['novels'], 'readonly');
                const store = transaction.objectStore('novels');
                const request = store.getAll();
                
                await new Promise((resolve) => {
                    request.onsuccess = () => {
                        request.result.forEach(novel => {
                            novels.push({
                                id: novel.id,
                                name: novel.name,
                                size: novel.size,
                                lastModified: novel.lastModified,
                                chaptersCount: novel.chapters ? novel.chapters.length : 0,
                                storageType: 'indexedDB'
                            });
                        });
                        resolve();
                    };
                });
            }
            
            // 按最后阅读时间排序
            novels.sort((a, b) => {
                const progressA = this.loadFromLocalStorage(`progress_${a.id}`);
                const progressB = this.loadFromLocalStorage(`progress_${b.id}`);
                const timeA = progressA ? new Date(progressA.lastRead) : new Date(0);
                const timeB = progressB ? new Date(progressB.lastRead) : new Date(0);
                return timeB - timeA;
            });
            
            return novels;
        } catch (error) {
            console.error('加载所有小说失败:', error);
            return [];
        }
    }
    
    // 加载阅读进度
    static loadProgress(novelId) {
        return this.loadFromLocalStorage(`progress_${novelId}`);
    }
    
    // 加载设置
    static loadSettings() {
        return this.loadFromLocalStorage('settings') || {};
    }
    
    // 加载字体
    static async loadFont(fontId = 'userFont') {
        try {
            return await this.loadFromIndexedDB('fonts', fontId);
        } catch (error) {
            console.error('加载字体失败:', error);
            return null;
        }
    }
    
    // 删除小说数据
    static async deleteNovel(novelId) {
        try {
            localStorage.removeItem(`novel_${novelId}`);
            localStorage.removeItem(`progress_${novelId}`);
            
            if (APP.db) {
                const transaction = APP.db.transaction(['novels', 'progress'], 'readwrite');
                transaction.objectStore('novels').delete(novelId);
                transaction.objectStore('progress').delete(novelId);
                await new Promise(resolve => transaction.oncomplete = resolve);
            }
            
            return true;
        } catch (error) {
            console.error('删除小说失败:', error);
            throw error;
        }
    }
    
    // 删除所有小说数据
    static async deleteAllNovels() {
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key.startsWith('novel_') || key.startsWith('progress_')) {
                    localStorage.removeItem(key);
                }
            }
            
            if (APP.db) {
                const transaction = APP.db.transaction(['novels', 'progress'], 'readwrite');
                transaction.objectStore('novels').clear();
                transaction.objectStore('progress').clear();
                await new Promise(resolve => transaction.oncomplete = resolve);
            }
            
            return true;
        } catch (error) {
            console.error('删除所有小说失败:', error);
            throw error;
        }
    }
    
    // 删除所有设置
    static deleteAllSettings() {
        try {
            localStorage.removeItem('settings');
            
            if (APP.db) {
                const transaction = APP.db.transaction(['settings'], 'readwrite');
                transaction.objectStore('settings').clear();
            }
            
            this.deleteFont();
            
            return true;
        } catch (error) {
            console.error('删除所有设置失败:', error);
            throw error;
        }
    }
    
    // 删除字体
    static async deleteFont() {
        try {
            if (APP.db) {
                const transaction = APP.db.transaction(['fonts'], 'readwrite');
                transaction.objectStore('fonts').clear();
                await new Promise(resolve => transaction.oncomplete = resolve);
            }
            
            return true;
        } catch (error) {
            console.error('删除字体失败:', error);
            throw error;
        }
    }
    
    // 获取存储使用情况
    static async getStorageInfo() {
        try {
            let totalSize = 0;
            let itemsCount = 0;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                totalSize += key.length + value.length;
                itemsCount++;
            }
            
            if (APP.db && 'estimate' in APP.db) {
                const estimate = await APP.db.estimate();
                totalSize += estimate.usage;
            }
            
            return {
                totalSize: totalSize,
                itemsCount: itemsCount,
                formattedSize: this.formatBytes(totalSize)
            };
        } catch (error) {
            console.error('获取存储信息失败:', error);
            return { totalSize: 0, itemsCount: 0, formattedSize: '0 B' };
        }
    }
    
    // 导出所有数据
    static async exportAllData() {
        try {
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                novels: [],
                settings: {},
                fonts: []
            };
            
            // 导出 LocalStorage 中的小说
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('novel_')) {
                    const novel = JSON.parse(localStorage.getItem(key));
                    if (novel) {
                        exportData.novels.push({
                            id: novel.id,
                            name: novel.name,
                            chapters: novel.chapters,
                            size: novel.size,
                            lastModified: novel.lastModified,
                            storageType: 'localStorage'
                        });
                    }
                }
            }
            
            // 导出 IndexedDB 中的小说
            if (APP.db) {
                const transaction = APP.db.transaction(['novels'], 'readonly');
                const store = transaction.objectStore('novels');
                const request = store.getAll();
                
                await new Promise((resolve) => {
                    request.onsuccess = () => {
                        request.result.forEach(novel => {
                            exportData.novels.push({
                                id: novel.id,
                                name: novel.name,
                                chapters: novel.chapters,
                                size: novel.size,
                                lastModified: novel.lastModified,
                                storageType: 'indexedDB'
                            });
                        });
                        resolve();
                    };
                });
            }
            
            // 导出设置
            exportData.settings = this.loadSettings();
            
            // 导出字体
            const font = await this.loadFont();
            if (font) {
                exportData.fonts.push(font);
            }
            
            return exportData;
        } catch (error) {
            console.error('导出数据失败:', error);
            throw error;
        }
    }
    
    // 导入数据
    static async importData(data) {
        try {
            if (!data.version || data.version !== '1.0') {
                throw new Error('不支持的导出文件格式');
            }
            
            let importedCount = 0;
            
            // 导入小说
            if (data.novels && Array.isArray(data.novels)) {
                for (const novel of data.novels) {
                    try {
                        await this.saveNovel(novel);
                        importedCount++;
                    } catch (error) {
                        console.warn(`导入小说失败 ${novel.name}:`, error);
                    }
                }
            }
            
            // 导入设置
            if (data.settings) {
                await this.saveSettings(data.settings);
            }
            
            // 导入字体
            if (data.fonts && Array.isArray(data.fonts) && data.fonts.length > 0) {
                for (const font of data.fonts) {
                    try {
                        await this.saveFont(font);
                    } catch (error) {
                        console.warn('导入字体失败:', error);
                    }
                }
            }
            
            return importedCount;
        } catch (error) {
            console.error('导入数据失败:', error);
            throw error;
        }
    }
    
    // 辅助方法：保存到 LocalStorage
    static saveToLocalStorage(key, data) {
        try {
            const dataStr = JSON.stringify(data);
            localStorage.setItem(key, dataStr);
            return true;
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                throw new Error('本地存储空间不足，请清除一些数据或使用较小的文件');
            }
            throw error;
        }
    }
    
    // 辅助方法：从 LocalStorage 加载
    static loadFromLocalStorage(key) {
        try {
            const dataStr = localStorage.getItem(key);
            return dataStr ? JSON.parse(dataStr) : null;
        } catch (error) {
            console.error(`从LocalStorage加载${key}失败:`, error);
            return null;
        }
    }
    
    // 辅助方法：保存到 IndexedDB
    static saveToIndexedDB(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!APP.db) {
                reject(new Error('IndexedDB未初始化'));
                return;
            }
            
            const transaction = APP.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(true);
            request.onerror = (event) => {
                console.error(`保存到IndexedDB失败:`, event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 辅助方法：从 IndexedDB 加载
    static loadFromIndexedDB(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!APP.db) {
                resolve(null);
                return;
            }
            
            const transaction = APP.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (event) => {
                console.error(`从IndexedDB加载失败:`, event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 辅助方法：格式化字节大小
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

// 加载设置
async function loadSettings() {
    try {
        const settings = await StorageManager.loadSettings();
        
        if (settings) {
            APP.fontSize = settings.fontSize || 16;
            APP.fontWeight = settings.fontWeight || 400;
            APP.letterSpacing = settings.letterSpacing || 0;
            APP.lineHeight = settings.lineHeight || 1.6;
            APP.paragraphSpacing = settings.paragraphSpacing || 1.0;
            
            // 更新UI控件
            dom.fontSize.value = APP.fontSize;
            dom.fontSizeValue.textContent = `${APP.fontSize}px`;
            dom.fontWeight.value = APP.fontWeight;
            dom.fontWeightValue.textContent = APP.fontWeight;
            dom.letterSpacing.value = APP.letterSpacing;
            dom.letterSpacingValue.textContent = `${APP.letterSpacing}px`;
            dom.lineHeight.value = Math.round(APP.lineHeight * 10);
            dom.lineHeightValue.textContent = APP.lineHeight.toFixed(1);
            dom.paragraphSpacing.value = Math.round(APP.paragraphSpacing * 10);
            dom.paragraphSpacingValue.textContent = `${APP.paragraphSpacing.toFixed(1)}em`;
            
            // 应用样式
            applyTextStyles();
        }
        
        // 加载自定义字体
        const font = await StorageManager.loadFont();
        if (font) {
            APP.customFont = font;
            applyCustomFont();
        }
    } catch (error) {
        console.error('加载设置失败:', error);
        showToast('加载设置失败', 'error');
    }
}

// 保存设置
async function saveSettings() {
    try {
        const settings = {
            fontSize: APP.fontSize,
            fontWeight: APP.fontWeight,
            letterSpacing: APP.letterSpacing,
            lineHeight: APP.lineHeight,
            paragraphSpacing: APP.paragraphSpacing
        };
        
        await StorageManager.saveSettings(settings);
    } catch (error) {
        console.error('保存设置失败:', error);
        showToast('保存设置失败', 'error');
    }
}

// 保存阅读进度
async function saveProgress() {
    if (!APP.currentNovel || APP.chapters.length === 0) return;
    
    try {
        await StorageManager.saveProgress(
            APP.currentNovel.id,
            APP.currentChapterIndex,
            APP.scrollPosition
        );
    } catch (error) {
        console.error('保存进度失败:', error);
    }
}

// 保存小说数据
async function saveNovel() {
    if (!APP.currentNovel || APP.chapters.length === 0) return;
    
    try {
        const novel = {
            id: APP.currentNovel.id,
            name: APP.currentNovel.name,
            chapters: APP.chapters,
            size: APP.currentNovel.size,
            lastModified: APP.currentNovel.lastModified
        };
        
        await StorageManager.saveNovel(novel);
        
        // 更新阅读历史
        await loadReadingHistory();
    } catch (error) {
        console.error('保存小说失败:', error);
        showToast('保存小说失败: ' + error.message, 'error');
    }
}

// 加载阅读历史
async function loadReadingHistory() {
    try {
        const novels = await StorageManager.loadAllNovels();
        
        if (novels.length > 0) {
            dom.historyList.style.display = 'block';
            dom.historyItems.innerHTML = '';
            
            novels.slice(0, 5).forEach(novel => {
                const progress = StorageManager.loadProgress(novel.id);
                
                const item = document.createElement('div');
                item.className = 'chapter-item glass';
                item.style.marginBottom = '8px';
                item.style.cursor = 'pointer';
                item.innerHTML = `
                    <div style="font-weight: 500; margin-bottom: 4px;">${novel.name}</div>
                    <div style="font-size: 12px; color: var(--secondary-text);">
                        共${novel.chaptersCount}章 | 
                        ${progress ? `上次阅读: 第${progress.chapterIndex + 1}章` : '未开始阅读'}
                    </div>
                `;
                
                item.addEventListener('click', async () => {
                    await loadNovelFromStorage(novel.id);
                });
                
                dom.historyItems.appendChild(item);
            });
        } else {
            dom.historyList.style.display = 'none';
        }
    } catch (error) {
        console.error('加载阅读历史失败:', error);
    }
}

// 从存储加载小说
async function loadNovelFromStorage(novelId) {
    showLoading(true);
    
    try {
        const novel = await StorageManager.loadNovel(novelId);
        
        if (!novel) {
            throw new Error('小说数据不存在');
        }
        
        APP.currentNovel = {
            id: novel.id,
            name: novel.name,
            size: novel.size,
            lastModified: novel.lastModified
        };
        
        APP.chapters = novel.chapters || [];
        
        // 加载阅读进度
        const progress = StorageManager.loadProgress(novelId);
        
        if (progress) {
            APP.currentChapterIndex = progress.chapterIndex || 0;
            APP.scrollPosition = progress.scrollPosition || 0;
        } else {
            APP.currentChapterIndex = 0;
            APP.scrollPosition = 0;
        }
        
        // 更新UI
        updateChaptersList();
        renderChapter();
        showContentArea();
        
        showToast(`《${novel.name}》加载成功`, 'success');
        
    } catch (error) {
        console.error('加载小说失败:', error);
        showToast('加载小说失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 读取文件内容
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            resolve(event.target.result);
        };
        
        reader.onerror = () => {
            reject(new Error('文件读取失败'));
        };
        
        reader.readAsText(file, 'UTF-8');
    });
}

// 处理文件选择
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.txt')) {
        showToast('请选择TXT格式的文件', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const novelId = await generateFileHash(file);
        APP.currentNovel = {
            id: novelId,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified
        };
        
        const content = await readFileContent(file);
        
        if (!content || content.trim().length === 0) {
            throw new Error('文件内容为空');
        }
        
        APP.chapters = parseChapters(content);
        
        if (APP.chapters.length === 0) {
            throw new Error('无法解析章节结构，请检查文件格式');
        }
        
        await saveNovel();
        
        const progress = StorageManager.loadProgress(novelId);
        
        if (progress) {
            APP.currentChapterIndex = progress.chapterIndex || 0;
            APP.scrollPosition = progress.scrollPosition || 0;
        } else {
            APP.currentChapterIndex = 0;
            APP.scrollPosition = 0;
        }
        
        updateChaptersList();
        renderChapter();
        showContentArea();
        
        showToast(`《${file.name}》加载成功，共${APP.chapters.length}章`, 'success');
        
    } catch (error) {
        console.error('文件加载失败:', error);
        showToast('文件加载失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
        dom.fileInput.value = '';
    }
}

// 生成文件哈希作为唯一标识
async function generateFileHash(file) {
    return `${file.name}_${file.size}_${file.lastModified}`.replace(/\s+/g, '_');
}

// 解析章节
function parseChapters(content) {
    const chapters = [];
    
    const chapterRegex = /^(第[零一二三四五六七八九十百千万\d]+章|第[零一二三四五六七八九十百千万\d]+回|第[零一二三四五六七八九十百千万\d]+节|第[零一二三四五六七八九十百千万\d]+卷|第[零一二三四五六七八九十百千万\d]+篇|[上下]?卷之[零一二三四五六七八九十百千万\d]+|CHAPTER\s+\d+|Chapter\s+\d+|\d+\.\s+|【.*?】|\[.*?\])/im;
    
    const lines = content.split(/\r?\n/);
    let currentChapter = { title: '开始', content: '' };
    let inChapter = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line === '') continue;
        
        if (chapterRegex.test(line)) {
            if (inChapter) {
                chapters.push({ ...currentChapter });
            } else {
                inChapter = true;
            }
            
            currentChapter = {
                title: line,
                content: ''
            };
        } else if (inChapter) {
            if (currentChapter.content) {
                currentChapter.content += '\n' + line;
            } else {
                currentChapter.content = line;
            }
        } else {
            if (currentChapter.content) {
                currentChapter.content += '\n' + line;
            } else {
                currentChapter.content = line;
            }
        }
    }
    
    if (currentChapter.content) {
        chapters.push({ ...currentChapter });
    }
    
    if (chapters.length === 0) {
        chapters.push({
            title: '全文',
            content: content
        });
    }
    
    return chapters;
}

// 更新章节列表
function updateChaptersList() {
    dom.chaptersList.innerHTML = '';
    dom.chaptersCount.textContent = APP.chapters.length;
    
    APP.chapters.forEach((chapter, index) => {
        const item = document.createElement('div');
        item.className = `chapter-item glass ${index === APP.currentChapterIndex ? 'active' : ''}`;
        item.textContent = chapter.title;
        item.title = chapter.title;
        
        item.addEventListener('click', () => {
            APP.currentChapterIndex = index;
            APP.scrollPosition = 0;
            renderChapter();
            updateChaptersList();
            saveProgress();
            toggleChaptersPanel();
        });
        
        dom.chaptersList.appendChild(item);
    });
}

// 渲染当前章节
function renderChapter() {
    if (APP.chapters.length === 0) return;
    
    const chapter = APP.chapters[APP.currentChapterIndex];
    let contentHTML = '';
    
    const paragraphs = chapter.content.split(/\n+/);
    
    paragraphs.forEach(paragraph => {
        if (paragraph.trim()) {
            contentHTML += `<p>${paragraph}</p>`;
        }
    });
    
    dom.content.innerHTML = contentHTML;
    
    updateChapterTitle(chapter.title);
    
    applyTextStyles();
    
    updateNavButtons();
    
    // 使用requestAnimationFrame优化动画
    raf(() => {
        const paragraphs = dom.content.querySelectorAll('p');
        paragraphs.forEach(p => {
            p.classList.remove('fade-in');
            if (APP.observer) {
                APP.observer.observe(p);
            }
        });
    });
    
    if (APP.scrollPosition > 0) {
        setTimeout(() => {
            dom.contentContainer.scrollTop = APP.scrollPosition;
        }, 50);
    }
    
    updateChaptersList();
}

// 更新章节标题显示
function updateChapterTitle(title) {
    dom.chapterTitle.textContent = title || '无标题';
    
    dom.chapterTitle.classList.remove('scrollable', 'scroll-once');
    
    if (APP.titleAnimationTimeout) {
        clearTimeout(APP.titleAnimationTimeout);
        APP.titleAnimationTimeout = null;
    }
    
    dom.chapterTitle.style.transform = 'translateX(0)';
    dom.chapterTitle.style.animation = '';
    
    setTimeout(() => {
        const containerWidth = dom.chapterTitle.parentElement.offsetWidth;
        const titleWidth = dom.chapterTitle.scrollWidth;
        
        if (titleWidth > containerWidth) {
            APP.titleAnimationTimeout = setTimeout(() => {
                dom.chapterTitle.classList.add('scroll-once');
                
                APP.titleAnimationTimeout = setTimeout(() => {
                    dom.chapterTitle.classList.remove('scroll-once');
                    dom.chapterTitle.style.transform = 'translateX(0)';
                }, 8000);
            }, 2000);
        }
    }, 100);
}

// 显示内容区域
function showContentArea() {
    dom.fileUploadArea.style.display = 'none';
    dom.contentContainer.style.display = 'block';
}

// 更新翻页按钮状态
function updateNavButtons() {
    const hasPrev = APP.currentChapterIndex > 0;
    const hasNext = APP.currentChapterIndex < APP.chapters.length - 1;
    
    [dom.prevPageBtn].forEach(btn => {
        if (hasPrev) {
            btn.classList.remove('glass-disabled');
        } else {
            btn.classList.add('glass-disabled');
        }
    });
    
    [dom.nextPageBtn].forEach(btn => {
        if (hasNext) {
            btn.classList.remove('glass-disabled');
        } else {
            btn.classList.add('glass-disabled');
        }
    });
}

// 上一章
function prevChapter() {
    if (APP.currentChapterIndex > 0) {
        APP.currentChapterIndex--;
        APP.scrollPosition = 0;
        renderChapter();
        saveProgress();
        dom.contentContainer.scrollTop = 0;
    }
}

// 下一章
function nextChapter() {
    if (APP.currentChapterIndex < APP.chapters.length - 1) {
        APP.currentChapterIndex++;
        APP.scrollPosition = 0;
        renderChapter();
        saveProgress();
        dom.contentContainer.scrollTop = 0;
    }
}

// 保存滚动位置
function saveScrollPosition() {
    if (APP.currentNovel && APP.chapters.length > 0) {
        APP.scrollPosition = dom.contentContainer.scrollTop;
        saveProgress();
    }
}

// 应用文本样式
function applyTextStyles() {
    dom.content.style.fontSize = `${APP.fontSize}px`;
    dom.content.style.fontWeight = APP.fontWeight;
    dom.content.style.letterSpacing = `${APP.letterSpacing}px`;
    dom.content.style.lineHeight = APP.lineHeight;
    
    const paragraphs = dom.content.querySelectorAll('p');
    paragraphs.forEach(p => {
        p.style.marginBottom = `${APP.paragraphSpacing}em`;
    });
}

// 更新字体大小
function updateFontSize() {
    APP.fontSize = parseInt(dom.fontSize.value);
    dom.fontSizeValue.textContent = `${APP.fontSize}px`;
    applyTextStyles();
    saveSettings();
}

// 更新字体粗细
function updateFontWeight() {
    APP.fontWeight = parseInt(dom.fontWeight.value);
    dom.fontWeightValue.textContent = APP.fontWeight;
    applyTextStyles();
    saveSettings();
}

// 更新字间距
function updateLetterSpacing() {
    APP.letterSpacing = parseInt(dom.letterSpacing.value);
    dom.letterSpacingValue.textContent = `${APP.letterSpacing}px`;
    applyTextStyles();
    saveSettings();
}

// 更新行间距
function updateLineHeight() {
    APP.lineHeight = parseInt(dom.lineHeight.value) / 10;
    dom.lineHeightValue.textContent = APP.lineHeight.toFixed(1);
    applyTextStyles();
    saveSettings();
}

// 更新段落间距
function updateParagraphSpacing() {
    APP.paragraphSpacing = parseInt(dom.paragraphSpacing.value) / 10;
    dom.paragraphSpacingValue.textContent = `${APP.paragraphSpacing.toFixed(1)}em`;
    applyTextStyles();
    saveSettings();
}

// 重置文字样式
async function resetTextStyle() {
    APP.fontSize = 16;
    APP.fontWeight = 400;
    APP.letterSpacing = 0;
    
    dom.fontSize.value = APP.fontSize;
    dom.fontSizeValue.textContent = `${APP.fontSize}px`;
    dom.fontWeight.value = APP.fontWeight;
    dom.fontWeightValue.textContent = APP.fontWeight;
    dom.letterSpacing.value = APP.letterSpacing;
    dom.letterSpacingValue.textContent = `${APP.letterSpacing}px`;
    
    applyTextStyles();
    await saveSettings();
    showToast('文字样式已重置', 'success');
}

// 重置段落样式
async function resetParagraphStyle() {
    APP.lineHeight = 1.6;
    APP.paragraphSpacing = 1.0;
    
    dom.lineHeight.value = Math.round(APP.lineHeight * 10);
    dom.lineHeightValue.textContent = APP.lineHeight.toFixed(1);
    dom.paragraphSpacing.value = Math.round(APP.paragraphSpacing * 10);
    dom.paragraphSpacingValue.textContent = `${APP.paragraphSpacing.toFixed(1)}em`;
    
    applyTextStyles();
    await saveSettings();
    showToast('段落样式已重置', 'success');
}

// 重置字体
async function resetFontStyle() {
    APP.customFont = null;
    
    try {
        await StorageManager.deleteFont();
        document.body.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif";
        updateFontPreview();
        showToast('字体已恢复为默认', 'success');
    } catch (error) {
        console.error('重置字体失败:', error);
        showToast('重置字体失败', 'error');
    }
}

// 重置所有设置
async function resetAllStyles() {
    await resetTextStyle();
    await resetParagraphStyle();
    await resetFontStyle();
    showToast('所有设置已重置', 'success');
}

// 处理字体上传
async function handleFontUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExtension)) {
        showToast('请选择TTF、OTF、WOFF或WOFF2格式的字体文件', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const reader = new FileReader();
        
        const fontData = await new Promise((resolve, reject) => {
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = () => {
                reject(new Error('字体文件读取失败'));
            };
            
            reader.readAsArrayBuffer(file);
        });
        
        const base64Font = arrayBufferToBase64(fontData);
        
        let fontFormat;
        switch (fileExtension) {
            case '.ttf':
                fontFormat = 'truetype';
                break;
            case '.otf':
                fontFormat = 'opentype';
                break;
            case '.woff':
                fontFormat = 'woff';
                break;
            case '.woff2':
                fontFormat = 'woff2';
                break;
            default:
                fontFormat = 'truetype';
        }
        
        const font = {
            id: 'userFont',
            name: file.name.replace(fileExtension, ''),
            data: base64Font,
            format: fontFormat,
            fileType: fileExtension.substring(1).toUpperCase(),
            uploadedAt: new Date().toISOString(),
            size: file.size
        };
        
        APP.customFont = font;
        await StorageManager.saveFont(font);
        
        applyCustomFont();
        updateFontPreview();
        
        showToast(`字体"${font.name}"上传成功`, 'success');
    } catch (error) {
        console.error('字体上传失败:', error);
        showToast('字体上传失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 将ArrayBuffer转换为Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// 应用自定义字体
function applyCustomFont() {
    if (!APP.customFont) return;
    
    try {
        const existingStyles = document.querySelectorAll('[data-custom-font-style]');
        existingStyles.forEach(style => style.remove());
        
        const fontFamilyName = 'CustomFont_' + Date.now();
        
        const style = document.createElement('style');
        style.setAttribute('data-custom-font-style', 'true');
        
        const fontData = APP.customFont.data;
        const fontFormat = APP.customFont.format;
        
        const fontFaceRule = `
        @font-face {
            font-family: '${fontFamilyName}';
            src: url('data:font/${APP.customFont.fileType.toLowerCase()};charset=utf-8;base64,${fontData}') format('${fontFormat}');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
        }
        `;
        
        style.textContent = fontFaceRule;
        document.head.appendChild(style);
        
        const testElement = document.createElement('span');
        testElement.style.fontFamily = fontFamilyName;
        testElement.style.position = 'absolute';
        testElement.style.left = '-9999px';
        testElement.style.fontSize = '16px';
        testElement.textContent = '测试字体加载';
        document.body.appendChild(testElement);
        
        setTimeout(() => {
            const loaded = document.fonts.check(`16px ${fontFamilyName}`);
            
            if (loaded) {
                document.body.style.fontFamily = `'${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
                console.log(`字体加载成功: ${fontFamilyName}`);
                showToast(`字体"${APP.customFont.name}"加载成功`, 'success');
            } else {
                console.warn('字体加载失败，尝试备用方法');
                applyCustomFontFallback(fontFamilyName, fontData, fontFormat);
            }
            
            document.body.removeChild(testElement);
            updateFontPreview();
            
        }, 100);
        
    } catch (error) {
        console.error('应用自定义字体失败:', error);
        showToast('应用自定义字体失败: ' + error.message, 'error');
    }
}

// 备用方法：使用FontFace API
function applyCustomFontFallback(fontFamilyName, fontData, fontFormat) {
    try {
        const existingFonts = document.fonts.values();
        for (const font of existingFonts) {
            if (font.family.startsWith('CustomFont_')) {
                document.fonts.delete(font);
            }
        }
        
        const binary = atob(fontData);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        
        const blob = new Blob([array], { type: `font/${APP.customFont.fileType.toLowerCase()}` });
        const fontUrl = URL.createObjectURL(blob);
        
        const fontFace = new FontFace(fontFamilyName, `url(${fontUrl}) format('${fontFormat}')`, {
            style: 'normal',
            weight: '400',
            display: 'swap'
        });
        
        fontFace.load().then((loadedFace) => {
            document.fonts.add(loadedFace);
            document.body.style.fontFamily = `'${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
            
            setTimeout(() => URL.revokeObjectURL(fontUrl), 1000);
            
            console.log(`字体通过备用方法加载成功: ${fontFamilyName}`);
            showToast(`字体"${APP.customFont.name}"加载成功`, 'success');
            
        }).catch((error) => {
            console.error('备用方法字体加载失败:', error);
            showToast('自定义字体加载失败，可能是字体文件损坏或不支持', 'error');
        });
        
    } catch (error) {
        console.error('备用方法失败:', error);
        showToast('字体加载失败: ' + error.message, 'error');
    }
}

// 更新字体预览
function updateFontPreview() {
    if (APP.customFont) {
        dom.fontPreview.style.display = 'block';
        dom.fontPreviewText.textContent = `字体预览：${APP.customFont.name}`;
        dom.fontPreviewName.textContent = `当前字体: ${APP.customFont.name} (${APP.customFont.fileType})`;
        dom.fontPreviewText.style.fontFamily = document.body.style.fontFamily;
    } else {
        dom.fontPreview.style.display = 'none';
        dom.fontPreviewText.textContent = '字体预览：中文字体示例';
        dom.fontPreviewName.textContent = '';
        dom.fontPreviewText.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif";
    }
}

// 清除小说数据
async function clearNovelData() {
    if (!confirm('确定要清除所有小说数据吗？此操作不可恢复。')) {
        return;
    }
    
    showLoading(true);
    
    try {
        await StorageManager.deleteAllNovels();
        
        APP.currentNovel = null;
        APP.chapters = [];
        APP.currentChapterIndex = 0;
        APP.scrollPosition = 0;
        
        dom.fileUploadArea.style.display = 'flex';
        dom.contentContainer.style.display = 'none';
        dom.chaptersList.innerHTML = '';
        dom.chaptersCount.textContent = '0';
        dom.chapterTitle.textContent = '请选择章节';
        
        await loadReadingHistory();
        
        showToast('所有小说数据已清除', 'success');
    } catch (error) {
        console.error('清除小说数据失败:', error);
        showToast('清除小说数据失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
        updateStorageInfo();
    }
}

// 清除设置
async function clearSettings() {
    if (!confirm('确定要清除所有设置吗？此操作不可恢复。')) {
        return;
    }
    
    showLoading(true);
    
    try {
        await StorageManager.deleteAllSettings();
        await loadSettings();
        showToast('所有设置已清除', 'success');
    } catch (error) {
        console.error('清除设置失败:', error);
        showToast('清除设置失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
        updateStorageInfo();
    }
}

// 导出所有数据
async function exportAllData() {
    showLoading(true);
    
    try {
        const exportData = await StorageManager.exportAllData();
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `novel-reader-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        showToast('数据导出成功', 'success');
    } catch (error) {
        console.error('导出数据失败:', error);
        showToast('导出数据失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 处理数据导入
async function handleDataImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.json')) {
        showToast('请选择JSON格式的备份文件', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const reader = new FileReader();
        
        const importData = await new Promise((resolve, reject) => {
            reader.onload = (e) => {
                try {
                    resolve(JSON.parse(e.target.result));
                } catch (error) {
                    reject(new Error('文件格式错误'));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsText(file);
        });
        
        const importedCount = await StorageManager.importData(importData);
        
        await loadSettings();
        await loadReadingHistory();
        
        updateFontPreview();
        
        showToast(`数据导入成功，共导入${importedCount}本小说`, 'success');
    } catch (error) {
        console.error('导入数据失败:', error);
        showToast('导入数据失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
        event.target.value = '';
        updateStorageInfo();
    }
}

// 更新存储信息
async function updateStorageInfo() {
    try {
        const info = await StorageManager.getStorageInfo();
        dom.storageInfo.textContent = 
            `已使用: ${info.formattedSize} | 项目数: ${info.itemsCount}`;
    } catch (error) {
        console.error('更新存储信息失败:', error);
        dom.storageInfo.textContent = '无法获取存储信息';
    }
}

// 切换章节面板
function toggleChaptersPanel() {
    if (APP.isAnimating) return;
    
    APP.isAnimating = true;
    APP.chaptersPanelOpen = !APP.chaptersPanelOpen;
    
    if (APP.chaptersPanelOpen) {
        dom.chaptersPanel.classList.remove('collapsed');
        dom.chaptersMask.classList.add('active');
        
        updateChaptersList();
        
        setTimeout(() => {
            const activeItem = dom.chaptersList.querySelector('.chapter-item.active');
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 300);
        
    } else {
        dom.chaptersPanel.classList.add('collapsed');
        dom.chaptersMask.classList.remove('active');
    }
    
    setTimeout(() => {
        APP.isAnimating = false;
    }, APP.chaptersPanelOpen ? 500 : 300);
}

// 切换设置面板
function toggleSettingsPanel() {
    if (APP.isAnimating) return;
    
    APP.isAnimating = true;
    APP.settingsPanelOpen = !APP.settingsPanelOpen;
    
    if (APP.settingsPanelOpen) {
        dom.settingsPanel.classList.remove('collapsed');
        dom.settingsMask.classList.add('active');
        
        updateStorageInfo();
        
    } else {
        dom.settingsPanel.classList.add('collapsed');
        dom.settingsMask.classList.remove('active');
    }
    
    setTimeout(() => {
        APP.isAnimating = false;
    }, APP.settingsPanelOpen ? 500 : 300);
}

// 初始化Intersection Observer用于段落渐显动画
function initIntersectionObserver() {
    const options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    APP.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                APP.observer.unobserve(entry.target);
            }
        });
    }, options);
}

// 显示加载动画
function showLoading(show) {
    if (show) {
        dom.loadingOverlay.classList.add('active');
    } else {
        dom.loadingOverlay.classList.remove('active');
    }
}

// 显示提示条
function showToast(message, type = 'info', duration = 3000) {
    dom.toast.textContent = message;
    dom.toast.className = `toast ${type}`;
    dom.toast.classList.add('show');
    
    setTimeout(() => {
        dom.toast.classList.remove('show');
    }, duration);
}