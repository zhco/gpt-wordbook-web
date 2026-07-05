import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Search, BookOpen, Heart, ChevronLeft, Star, Shuffle, Settings, X, Volume2, BarChart3, CheckCircle, XCircle, Info, GraduationCap, Calendar, Play, Check, ChevronRight, Upload, Download, Moon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Fuse from 'fuse.js'
import wordData from './data/words.json'
import wordLevels from './data/word-levels.json'

// Web 版：生成固定设备 ID（基于 localStorage）
function getDeviceId() {
  let id = localStorage.getItem('gptwordbook_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('gptwordbook_device_id', id)
  }
  return id
}

// Supabase 配置
const SUPABASE_URL = 'https://fedlhohopipeyrmdctfr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZGxob2hvcGlwZXlybWRjdGZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMxMTgsImV4cCI6MjA5NTgyOTExOH0.aQ5h9c11gObhvvCJpehPwRk7tn_7vfjtPMuJz7oXMDI'

// 单词级别标签配置
const LEVEL_CONFIG = {
  'cet4':   { label: '四级', color: 'bg-green-100 text-green-700' },
  'cet6':   { label: '六级', color: 'bg-blue-100 text-blue-700' },
  'cet4+6': { label: '四六级', color: 'bg-purple-100 text-purple-700' },
  'tem4':   { label: '专四', color: 'bg-orange-100 text-orange-700' },
  'tem8':   { label: '专八', color: 'bg-red-100 text-red-700' },
  'beyond': { label: '超纲', color: 'bg-gray-100 text-gray-500' },
}

function getWordLevel(word) {
  return wordLevels[word.toLowerCase()] || 'beyond'
}

function LevelTag({ word }) {
  const level = getWordLevel(word)
  const config = LEVEL_CONFIG[level]
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${config.color} font-medium`}>
      {config.label}
    </span>
  )
}

const SECTIONS = [
  { id: 'home', label: '单词本', icon: BookOpen },
  { id: 'study', label: '学习', icon: GraduationCap },
  { id: 'favorites', label: '收藏', icon: Heart },
  { id: 'settings', label: '设置', icon: Settings },
]

function App() {
  const [currentView, setCurrentView] = useState('home')
  const [selectedWord, setSelectedWord] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gptwordbook_favorites') || '[]') } catch { return [] }
  })
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gptwordbook_history') || '[]') } catch { return [] }
  })
  const [searchResults, setSearchResults] = useState([])
  const [dailyWord, setDailyWord] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [fuse, setFuse] = useState(null)
  const [wordsList, setWordsList] = useState([])
  const [ttsReady, setTtsReady] = useState(false)
  const [studyView, setStudyView] = useState('plan') // 'plan' or 'daily'
  const [studyContext, setStudyContext] = useState(null) // { words: [], currentIndex: number }
  const [masteredWords, setMasteredWords] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gptwordbook_mastered') || '{}') } catch { return {} }
  })
  // 激活授权状态
  const [isActivated, setIsActivated] = useState(() => {
    try { return localStorage.getItem('gptwordbook_activated') === 'true' } catch { return false }
  })
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('gptwordbook_darkmode') === 'true' } catch { return false }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('gptwordbook_darkmode', darkMode)
  }, [darkMode])
  const [activateCode, setActivateCode] = useState('')
  const [activateError, setActivateError] = useState('')
  const [activateLoading, setActivateLoading] = useState(false)
  const [deviceId, setDeviceId] = useState('')

  // 标记单词已学
  const markAsStudied = useCallback((word) => {
    setMasteredWords(prev => {
      if (prev[word]) return prev
      const next = { ...prev, [word]: true }
      localStorage.setItem('gptwordbook_mastered', JSON.stringify(next))
      return next
    })
  }, [])

  // App 启动时初始化 TTS 引擎 + 获取设备 ID + 检查激活状态
  useEffect(() => {
    const initApp = async () => {
      try {
        // 获取设备 ID（Web 版使用 localStorage 持久化）
        const id = getDeviceId()
        setDeviceId(id)
        // 检查该设备是否已激活
        if (!isActivated && id) {
          checkDeviceActivated(id)
        }
        // Web 版 TTS：直接使用有道 API，始终就绪
        setTtsReady(true)
      } catch (e) {
        console.warn('Init error:', e)
      }
    }
    initApp()
  }, [])

  // 3 分钟后未激活则弹出激活窗口
  useEffect(() => {
    if (isActivated) return
    const timer = setTimeout(() => {
      setShowActivateModal(true)
    }, 3 * 60 * 1000) // 3 分钟
    return () => clearTimeout(timer)
  }, [isActivated])

  // 检查设备是否已激活
  const checkDeviceActivated = async (devId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/device_activations?device_id=eq.${encodeURIComponent(devId)}&select=code`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
      const data = await res.json()
      if (data && data.length > 0) {
        setIsActivated(true)
        localStorage.setItem('gptwordbook_activated', 'true')
      }
    } catch (e) {
      console.warn('Check activation error:', e)
    }
  }

  // 提交激活码
  const submitActivation = async () => {
    const code = activateCode.trim().toUpperCase()
    if (!code || !deviceId) return

    // 本地格式校验：GPT-2026-XXXX-XXXX
    const formatCheck = /^GPT-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
    if (!formatCheck.test(code)) {
      setActivateError('激活码格式不正确，示例：GPT-2026-ABCD-1234')
      return
    }

    setActivateLoading(true)
    setActivateError('')
    try {
      // 1. 验证激活码是否存在且有效
      const codeRes = await fetch(`${SUPABASE_URL}/rest/v1/activation_codes?code=eq.${encodeURIComponent(code)}&is_active=eq.true&select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
      const codes = await codeRes.json()
      if (!codes || codes.length === 0) {
        setActivateError('激活码无效或已被禁用')
        setActivateLoading(false)
        return
      }
      // 2. 记录设备激活
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/device_activations`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ device_id: deviceId, code })
      })
      if (insertRes.ok || insertRes.status === 409) {
        setIsActivated(true)
        localStorage.setItem('gptwordbook_activated', 'true')
        setShowActivateModal(false)
        setActivateCode('')
      } else {
        setActivateError('激活失败，请重试')
      }
    } catch (e) {
      setActivateError('网络错误，请检查网络连接')
    }
    setActivateLoading(false)
  }

  // Android 返回键处理：左滑/返回键 → 返回上级而非退出 App
  useEffect(() => {
    window.onAndroidBack = () => {
      // 优先级1: 关闭单词详情
      if (selectedWord) {
        setSelectedWord(null)
        setStudyContext(null)
        return true
      }
      // 优先级2: 关闭搜索
      if (showSearch) {
        setShowSearch(false)
        setSearchQuery('')
        return true
      }
      // 优先级3: 关闭覆盖率报告弹窗
      const modal = document.querySelector('[data-modal="coverage"]')
      if (modal) {
        // 触发关闭
        const closeBtn = modal.querySelector('button')
        if (closeBtn) closeBtn.click()
        return true
      }
      // 优先级4: 如果不在首页，返回首页
      if (currentView !== 'home') {
        setCurrentView('home')
        return true
      }
      // 首页时退出 App
      return false
    }
    return () => { window.onAndroidBack = null }
  }, [selectedWord, showSearch, currentView])

  useEffect(() => {
    const words = Object.entries(wordData).map(([word, data]) => ({ word, ...data }))
    setWordsList(words)
    setFuse(new Fuse(words, { keys: ['word'], threshold: 0.3, includeScore: true }))

    const today = new Date().toDateString()
    const savedDaily = localStorage.getItem('gptwordbook_daily')
    const savedDate = localStorage.getItem('gptwordbook_daily_date')
    if (savedDaily && savedDate === today) {
      setDailyWord(JSON.parse(savedDaily))
    } else {
      const randomWord = words[Math.floor(Math.random() * words.length)]
      setDailyWord(randomWord)
      localStorage.setItem('gptwordbook_daily', JSON.stringify(randomWord))
      localStorage.setItem('gptwordbook_daily_date', today)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('gptwordbook_favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    localStorage.setItem('gptwordbook_history', JSON.stringify(history))
  }, [history])

  useEffect(() => {
    if (searchQuery.trim() && fuse) {
      const results = fuse.search(searchQuery.trim()).slice(0, 50)
      setSearchResults(results.map(r => r.item))
    } else {
      setSearchResults([])
    }
  }, [searchQuery, fuse])

  const toggleFavorite = useCallback((word) => {
    setFavorites(prev => prev.includes(word) ? prev.filter(w => w !== word) : [...prev, word])
  }, [])

  const addToHistory = useCallback((word) => {
    setHistory(prev => [word, ...prev.filter(w => w !== word)].slice(0, 50))
  }, [])

  const openWord = useCallback((wordObj) => {
    setSelectedWord(wordObj)
    addToHistory(wordObj.word)
    // 学习模式下自动标记已学
    if (studyContext) {
      markAsStudied(wordObj.word)
    }
  }, [addToHistory, studyContext, markAsStudied])

  const isFavorite = (word) => favorites.includes(word)

  const getRandomWord = () => {
    if (wordsList.length === 0) return
    const random = wordsList[Math.floor(Math.random() * wordsList.length)]
    openWord(random)
  }

  if (selectedWord) {
    const goToWord = (idx) => {
      if (studyContext && studyContext.words[idx]) {
        const word = studyContext.words[idx]
        setSelectedWord(word)
        addToHistory(word.word)
        setStudyContext(prev => ({ ...prev, currentIndex: idx }))
        markAsStudied(word.word)
      }
    }

    return (
      <WordDetail
        wordData={selectedWord}
        onBack={() => { setSelectedWord(null); setStudyContext(null) }}
        isFavorite={isFavorite(selectedWord.word)}
        onToggleFavorite={() => toggleFavorite(selectedWord.word)}
        ttsReady={ttsReady}
        onPrev={studyContext && studyContext.currentIndex > 0 ? () => goToWord(studyContext.currentIndex - 1) : undefined}
        onNext={studyContext && studyContext.currentIndex < studyContext.words.length - 1 ? () => goToWord(studyContext.currentIndex + 1) : undefined}
      />
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-dark-bg">
      {/* 激活弹窗 */}
      {showActivateModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            {isActivated ? (
              <>
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle size={32} className="text-green-500" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">已激活</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">此设备已成功激活，可使用全部功能</p>
                </div>
                <p className="text-xs text-gray-400 text-center mt-2">设备 ID: {deviceId.slice(0, 16)}...</p>
                <button
                  onClick={() => setShowActivateModal(false)}
                  className="w-full py-3 rounded-xl font-semibold mt-4 bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-hover transition"
                >
                  关闭
                </button>
              </>
            ) : (
              <>
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Star size={32} className="text-sky-500" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">激活授权</h2>
                  <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">请输入激活码以继续使用全部功能</p>
                </div>
                <input
                  type="text"
                  placeholder="请输入激活码"
                  value={activateCode}
                  onChange={(e) => setActivateCode(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-dark-border dark:bg-dark-hover dark:text-dark-text rounded-xl text-center text-lg tracking-widest font-mono focus:border-sky-500 focus:outline-none"
                />
                {activateError && (
                  <p className="text-red-500 text-sm text-center mt-2">{activateError}</p>
                )}
                <button
                  onClick={submitActivation}
                  disabled={activateLoading || !activateCode.trim()}
                  className={`w-full py-3 rounded-xl font-semibold mt-4 transition ${activateLoading || !activateCode.trim() ? 'bg-gray-200 dark:bg-dark-hover text-gray-400' : 'bg-sky-500 dark:bg-dark-hover text-white hover:bg-sky-600'}`}
                >
                  {activateLoading ? '验证中...' : '立即激活'}
                </button>
                <button
                  onClick={() => window.open('https://zhco.github.io/danci_auth.html', '_blank')}
                  className="w-full py-3 rounded-xl font-semibold mt-2 bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-hover transition"
                >
                  如何获取激活码
                </button>
                <p className="text-xs text-gray-400 text-center mt-3">设备 ID: {deviceId.slice(0, 16)}...</p>
              </>
            )}
          </div>
        </div>
      )}

      <header className="bg-sky-500 dark:bg-dark-card text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">GPT 单词本</h1>
          <div className="flex items-center gap-2">
            {!isActivated && (
              <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-medium">未激活</span>
            )}
            <button onClick={() => setShowSearch(true)} className="p-2 rounded-full hover:bg-sky-400 transition">
              <Search size={20} />
            </button>
            <button onClick={getRandomWord} className="p-2 rounded-full hover:bg-sky-400 transition">
              <Shuffle size={20} />
            </button>
          </div>
        </div>
      </header>

      {showSearch && (
        <div className="fixed inset-0 bg-white dark:bg-dark-card z-50 flex flex-col">
          <div className="bg-sky-500 text-white px-4 py-3 flex items-center gap-3" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <Search size={20} className="text-sky-200" />
            <input
              autoFocus
              type="text"
              placeholder="搜索单词..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-white dark:text-dark-text placeholder-sky-200 outline-none text-base"
            />
            <button onClick={() => { setShowSearch(false); setSearchQuery('') }} className="p-1">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {searchQuery.trim() ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {searchResults.map(item => (
                  <button
                    key={item.word}
                    onClick={() => { openWord(item); setShowSearch(false); setSearchQuery('') }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span className="font-medium text-gray-900">{item.word}</span>
                    {isFavorite(item.word) && <Star size={16} className="text-yellow-400 fill-yellow-400" />}
                  </button>
                ))}
                {searchResults.length === 0 && (
                  <div className="p-8 text-center text-gray-400">未找到相关单词</div>
                )}
              </div>
            ) : (
              <div className="p-4">
                {history.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">最近浏览</h3>
                    <div className="flex flex-wrap gap-2">
                      {history.slice(0, 10).map(w => (
                        <button
                          key={w}
                          onClick={() => {
                            const wordObj = wordsList.find(item => item.word === w)
                            if (wordObj) { openWord(wordObj); setShowSearch(false) }
                          }}
                          className="px-3 py-1.5 bg-gray-100 dark:bg-dark-hover rounded-full text-sm text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-hover"
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto scrollbar-hide">
        {currentView === 'home' && (
          <HomeView dailyWord={dailyWord} onOpenWord={openWord} wordsList={wordsList} isFavorite={isFavorite} />
        )}
        {currentView === 'study' && (
          <StudyView wordsList={wordsList} studyView={studyView} setStudyView={setStudyView} onOpenWord={openWord} setStudyContext={setStudyContext} masteredWords={masteredWords} setMasteredWords={setMasteredWords} markAsStudied={markAsStudied} />
        )}
        {currentView === 'favorites' && (
          <FavoritesView favorites={favorites} wordsList={wordsList} onOpenWord={openWord} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
        )}
        {currentView === 'settings' && (
          <SettingsView totalWords={wordsList.length} favoritesCount={favorites.length} onClearHistory={() => setHistory([])} onClearFavorites={() => setFavorites([])} isActivated={isActivated} onOpenActivate={() => setShowActivateModal(true)} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(v => !v)} />
        )}
      </main>

      <nav className="bg-white dark:bg-dark-card border-t border-gray-200 dark:border-dark-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-around">
          {SECTIONS.map(section => {
            const Icon = section.icon
            const isActive = currentView === section.id
            return (
              <button
                key={section.id}
                onClick={() => setCurrentView(section.id)}
                className={`flex flex-col items-center py-2 px-4 flex-1 transition ${isActive ? 'text-sky-500' : 'text-gray-400'}`}
              >
                <Icon size={22} />
                <span className="text-xs mt-0.5">{section.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function HomeView({ dailyWord, onOpenWord, wordsList, isFavorite }) {
  const [letterFilter, setLetterFilter] = useState('')
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  const filteredWords = letterFilter
    ? wordsList.filter(w => w.word.toUpperCase().startsWith(letterFilter))
    : wordsList

  return (
    <div className="pb-4">
      {dailyWord && (
        <div className="mx-4 mt-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">每日一词</div>
          <button
            onClick={() => onOpenWord(dailyWord)}
            className="w-full rounded-2xl p-5 text-white text-left shadow-lg"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{dailyWord.word}</div>
                <div className="text-sky-100 text-sm mt-1 line-clamp-2">
                  {dailyWord.content?.substring(0, 80).replace(/[#*\n]/g, '')}...
                </div>
              </div>
              {isFavorite(dailyWord.word) && <Star size={24} className="text-yellow-300 fill-yellow-300" />}
            </div>
          </button>
        </div>
      )}

      <div className="mt-4 px-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">按字母浏览</div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2">
          <button
            onClick={() => setLetterFilter('')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${letterFilter === '' ? 'bg-sky-500 text-white' : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-text'}`}
          >
            全部
          </button>
          {letters.map(l => (
            <button
              key={l}
              onClick={() => setLetterFilter(l === letterFilter ? '' : l)}
              className={`w-9 h-9 rounded-lg text-sm font-medium flex items-center justify-center transition ${letterFilter === l ? 'bg-sky-500 text-white' : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-text'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 px-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          {letterFilter ? `以 "${letterFilter}" 开头的单词` : '热门单词'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {filteredWords.map(item => (
            <button
              key={item.word}
              onClick={() => onOpenWord(item)}
              className="bg-white dark:bg-dark-card rounded-xl p-3 text-left shadow-sm border border-gray-100 dark:border-dark-border hover:shadow-md transition active:scale-95"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900 dark:text-dark-text">{item.word}</span>
                <div className="flex items-center gap-1">
                  <LevelTag word={item.word} />
                  {isFavorite(item.word) && <Star size={14} className="text-yellow-400 fill-yellow-400" />}
                </div>
              </div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-1 line-clamp-1">
                {item.content?.substring(0, 40).replace(/[#*\n]/g, '')}...
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// 学习模式组件
function StudyView({ wordsList, studyView, setStudyView, onOpenWord, setStudyContext, masteredWords, setMasteredWords, markAsStudied }) {
  const STORAGE_KEY = 'gptwordbook_study_plan'

  const [plan, setPlan] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  // 如果有已保存的计划，自动切换到每日学习视图
  useEffect(() => {
    if (plan && studyView === 'plan') {
      setStudyView('daily')
    }
  }, [plan])
  const [dailyWords, setDailyWords] = useState([])

  // 获取指定级别的所有单词
  const getWordsByLevel = (level) => {
    return wordsList.filter(item => {
      const wLevel = getWordLevel(item.word)
      if (level === 'cet4') return wLevel === 'cet4' || wLevel === 'cet4+6'
      if (level === 'cet6') return wLevel === 'cet6' || wLevel === 'cet4+6'
      if (level === 'tem4') return wLevel === 'tem4'
      if (level === 'tem8') return wLevel === 'tem8'
      return true // 'all'
    })
  }

  // 伪随机洗牌（基于种子，保证每天固定顺序）
  const seededShuffle = (array, seed) => {
    const arr = [...array]
    let s = seed
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647
      const j = s % (i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  // 创建学习计划（预分配每日单词，确保不重复）
  const createPlan = (level, dailyCount) => {
    const words = getWordsByLevel(level)
    const seed = Date.now()
    const shuffled = seededShuffle(words, seed)
    const totalDays = Math.ceil(shuffled.length / dailyCount)
    // 预分配每天的单词列表
    const dailyWordLists = []
    for (let i = 0; i < totalDays; i++) {
      dailyWordLists.push(shuffled.slice(i * dailyCount, (i + 1) * dailyCount).map(w => w.word))
    }
    const newPlan = {
      level,
      dailyCount,
      totalDays,
      totalWords: shuffled.length,
      seed,
      startDate: new Date().toISOString().split('T')[0],
      currentDay: 1,
      dailyWordLists, // 预分配，确保不重复
    }
    setPlan(newPlan)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPlan))
    setStudyView('daily')
  }

  // 获取今日单词
  useEffect(() => {
    if (!plan || studyView !== 'daily') return
    if (plan.dailyWordLists) {
      // 使用预分配的单词列表
      const todayWordNames = plan.dailyWordLists[plan.currentDay - 1] || []
      const todayWords = todayWordNames.map(name => wordsList.find(w => w.word === name)).filter(Boolean)
      setDailyWords(todayWords)
    } else {
      // 兼容旧计划（没有预分配的情况）
      const words = getWordsByLevel(plan.level)
      const shuffled = seededShuffle(words, plan.seed)
      const startIdx = (plan.currentDay - 1) * plan.dailyCount
      const todayWords = shuffled.slice(startIdx, startIdx + plan.dailyCount)
      setDailyWords(todayWords)
    }
  }, [plan, studyView, wordsList])

  // 标记单词已掌握/取消（手动点击）
  const toggleMastered = (word) => {
    setMasteredWords(prev => {
      const next = { ...prev, [word]: !prev[word] }
      localStorage.setItem('gptwordbook_mastered', JSON.stringify(next))
      return next
    })
  }

  // 完成今日学习
  const finishToday = () => {
    if (!plan) return
    const nextDay = Math.min(plan.currentDay + 1, plan.totalDays)
    const updated = { ...plan, currentDay: nextDay }
    setPlan(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  // 重置计划
  const resetPlan = () => {
    if (!confirm('确定要重置学习计划吗？进度将清零。')) return
    setPlan(null)
    setMasteredWords({})
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('gptwordbook_mastered')
    setStudyView('plan')
  }

  // 学习计划设置页
  if (studyView === 'plan' && !plan) {
    const levelOptions = [
      { id: 'cet4', label: 'CET-4 四级', desc: `${getWordsByLevel('cet4').length} 词`, color: 'border-green-400 bg-green-50' },
      { id: 'cet6', label: 'CET-6 六级', desc: `${getWordsByLevel('cet6').length} 词`, color: 'border-blue-400 bg-blue-50' },
      { id: 'tem4', label: 'TEM-4 专四', desc: `${getWordsByLevel('tem4').length} 词`, color: 'border-orange-400 bg-orange-50' },
      { id: 'tem8', label: 'TEM-8 专八', desc: `${getWordsByLevel('tem8').length} 词`, color: 'border-red-400 bg-red-50' },
      { id: 'all', label: '全部词汇', desc: `${wordsList.length} 词`, color: 'border-purple-400 bg-purple-50' },
    ]
    const countOptions = [5, 10, 15, 20, 30, 50]

    return (
      <StudyPlanSetup
        levelOptions={levelOptions}
        countOptions={countOptions}
        onStart={createPlan}
      />
    )
  }

  // 每日学习页
  if (studyView === 'daily' && plan) {
    const masteredCount = dailyWords.filter(w => masteredWords[w.word]).length
    const progress = dailyWords.length > 0 ? Math.round(masteredCount / dailyWords.length * 100) : 0
    const overallProgress = Math.round((plan.currentDay - 1) / plan.totalDays * 100)

    return (
      <div className="p-4">
        {/* 进度概览 */}
        <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500 dark:text-dark-muted">第 {plan.currentDay} / {plan.totalDays} 天</span>
            <span className="text-sm font-bold text-sky-500">{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
            <div className="bg-sky-500 h-2 rounded-full transition-all" style={{width: `${overallProgress}%`}}></div>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-dark-muted">
            <span>今日进度: {masteredCount}/{dailyWords.length} ({progress}%)</span>
            <button onClick={resetPlan} className="text-red-400">重置计划</button>
          </div>
        </div>

        {/* 今日单词列表 */}
        <div className="space-y-2">
          {dailyWords.map((item, idx) => {
            const isMastered = masteredWords[item.word]
            return (
              <div
                key={item.word}
                onClick={() => { markAsStudied(item.word); setStudyContext({ words: dailyWords, currentIndex: idx }); onOpenWord(item) }}
                className={`bg-white dark:bg-dark-card rounded-xl p-3 shadow-sm border transition cursor-pointer active:scale-[0.98] ${isMastered ? 'border-green-200 bg-green-50/50' : 'border-gray-100 dark:border-dark-border'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs text-gray-400 w-6">{idx + 1}</span>
                    <span className="font-semibold text-gray-900 dark:text-dark-text truncate">{item.word}</span>
                    <LevelTag word={item.word} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMastered(item.word) }}
                    className={`p-2 rounded-full transition shrink-0 ${isMastered ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                  >
                    <Check size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* 完成按钮 */}
        {progress === 100 && plan.currentDay < plan.totalDays && (
          <div className="mt-4">
            <button
              onClick={finishToday}
              className="w-full py-3 bg-sky-500 text-white rounded-xl font-semibold hover:bg-sky-600 transition flex items-center justify-center gap-2"
            >
              完成今日学习，进入第 {plan.currentDay + 1} 天
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        {progress === 100 && plan.currentDay >= plan.totalDays && (
          <div className="mt-4 bg-green-50 rounded-xl p-4 text-center">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-700">恭喜完成全部学习计划！</p>
            <button onClick={resetPlan} className="mt-2 text-sm text-sky-500 underline">开始新的计划</button>
          </div>
        )}
      </div>
    )
  }

  return null
}

// 学习计划设置组件
function StudyPlanSetup({ levelOptions, countOptions, onStart }) {
  const [selectedLevel, setSelectedLevel] = useState(null)
  const [selectedCount, setSelectedCount] = useState(null)

  const canStart = selectedLevel && selectedCount
  const selectedLevelOpt = levelOptions.find(o => o.id === selectedLevel)
  const totalDays = canStart ? Math.ceil(parseInt(selectedLevelOpt.desc) / selectedCount) : 0

  return (
    <div className="p-4">
      <div className="bg-sky-50 dark:bg-dark-card rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap size={20} className="text-sky-500" />
          <h2 className="text-lg font-bold text-sky-700">学习计划</h2>
        </div>
        <p className="text-sm text-sky-600">选择词库范围和每日学习量，系统会自动分配每天的学习任务</p>
      </div>

      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-700 dark:text-dark-text mb-2">选择词库</div>
        <div className="grid grid-cols-3 gap-2">
          {levelOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setSelectedLevel(opt.id)}
              className={`p-3 rounded-xl border-2 text-center transition ${selectedLevel === opt.id ? 'border-sky-500 bg-sky-50' : opt.color}`}
            >
              <div className="font-semibold text-gray-900 dark:text-dark-text text-sm">{opt.label}</div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-700 dark:text-dark-text mb-2">每日单词数</div>
        <div className="grid grid-cols-3 gap-2">
          {countOptions.map(c => (
            <button
              key={c}
              onClick={() => setSelectedCount(c)}
              className={`p-3 rounded-xl border-2 text-center transition ${selectedCount === c ? 'border-sky-500 bg-sky-50' : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card'}`}
            >
              <div className="font-semibold text-gray-900 dark:text-dark-text text-sm">{c} 个/天</div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-0.5">{c <= 10 ? '轻松' : c <= 20 ? '适中' : '挑战'}</div>
            </button>
          ))}
        </div>
      </div>

      {canStart && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-100 dark:border-dark-border p-4 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-dark-muted">预计学习周期</span>
            <span className="font-bold text-sky-500">{totalDays} 天</span>
          </div>
        </div>
      )}

      <button
        onClick={() => onStart(selectedLevel, selectedCount)}
        disabled={!canStart}
        className={`w-full py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${canStart ? 'bg-sky-500 text-white hover:bg-sky-600' : 'bg-gray-200 dark:bg-dark-hover text-gray-400 cursor-not-allowed'}`}
      >
        <Play size={18} />
        开始学习
      </button>
    </div>
  )
}

function FavoritesView({ favorites, wordsList, onOpenWord, isFavorite, onToggleFavorite }) {
  const favWords = favorites.map(w => wordsList.find(item => item.word === w)).filter(Boolean)

  if (favWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <Heart size={48} className="mb-4 text-gray-300" />
        <p>暂无收藏单词</p>
        <p className="text-sm mt-1">点击单词详情页的星标来收藏</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">已收藏 {favorites.length} 个单词</div>
      <div className="space-y-2">
        {favWords.map(item => (
          <div key={item.word} className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm border border-gray-100 dark:border-dark-border flex items-center justify-between">
            <button onClick={() => onOpenWord(item)} className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-dark-text">{item.word}</span>
                <LevelTag word={item.word} />
              </div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-1 line-clamp-1">
                {item.content?.substring(0, 60).replace(/[#*\n]/g, '')}...
              </div>
            </button>
            <button onClick={() => onToggleFavorite(item.word)} className="p-2 ml-2">
              <Star size={20} className="text-yellow-400 fill-yellow-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function CoverageReport({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/80 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-dark-card w-full max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-dark-border">
          <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">词汇覆盖率报告</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 dark:text-dark-text">
          {/* 总词数 */}
          <div className="bg-sky-50 dark:bg-dark-card rounded-xl p-4 text-center">
            <div className="text-sm text-sky-600">词库总量</div>
            <div className="text-3xl font-bold text-sky-500">13,750</div>
            <div className="text-xs text-sky-400 mt-1">涵盖四六级 + 专四专八</div>
          </div>

          {/* 四六级覆盖率 */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
              <BarChart3 size={18} className="text-sky-500" />
              四六级覆盖率
            </h3>

            <div className="bg-white dark:bg-dark-hover rounded-xl border border-gray-100 dark:border-dark-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-dark-text">CET-4</span>
                <span className="text-sm font-bold text-green-500">99.96%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{width: '99.96%'}}></div>
              </div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-1">4,541 / 4,543 词</div>
            </div>

            <div className="bg-white dark:bg-dark-hover rounded-xl border border-gray-100 dark:border-dark-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-dark-text">CET-6</span>
                <span className="text-sm font-bold text-green-500">99.95%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{width: '99.95%'}}></div>
              </div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-1">3,989 / 3,991 词</div>
            </div>

            <div className="bg-white dark:bg-dark-hover rounded-xl border border-gray-100 dark:border-dark-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-dark-text">CET-4 + CET-6 合并</span>
                <span className="text-sm font-bold text-green-500">99.94%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{width: '99.94%'}}></div>
              </div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-1">6,657 / 6,661 词</div>
            </div>
          </div>

          {/* 未覆盖词汇 */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
              <XCircle size={18} className="text-orange-500" />
              未覆盖词汇（仅 4 个）
            </h3>
            <div className="bg-orange-50 dark:bg-dark-card rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded">CET-4</span>
                <div className="text-sm">
                  <span className="font-mono font-medium">administrative</span>
                  <span className="text-gray-500"> — 行政的</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded">CET-4</span>
                <div className="text-sm">
                  <span className="font-mono font-medium">negro</span>
                  <span className="text-gray-500"> — 黑人（现代英语已少用）</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded">CET-6</span>
                <div className="text-sm">
                  <span className="font-mono font-medium">abbreviation</span>
                  <span className="text-gray-500"> — 缩写</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded">CET-6</span>
                <div className="text-sm">
                  <span className="font-mono font-medium">countermeasure</span>
                  <span className="text-gray-500"> — 对策、反制措施</span>
                </div>
              </div>
            </div>
          </div>

          {/* 专四专八覆盖率 */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
              <GraduationCap size={18} className="text-orange-500" />
              专四专八覆盖率
            </h3>

            <div className="bg-white dark:bg-dark-hover rounded-xl border border-gray-100 dark:border-dark-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-dark-text">TEM-4 专四</span>
                <span className="text-sm font-bold text-green-500">2,378 词</span>
              </div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-1">词库中已包含的专四词汇</div>
            </div>

            <div className="bg-white dark:bg-dark-hover rounded-xl border border-gray-100 dark:border-dark-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-dark-text">TEM-8 专八</span>
                <span className="text-sm font-bold text-green-500">3,418 词</span>
              </div>
              <div className="text-xs text-gray-400 dark:text-dark-muted mt-1">词库中已包含的专八词汇</div>
            </div>
          </div>

          {/* 专四专八词汇 */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
              <CheckCircle size={18} className="text-sky-500" />
              专四专八词汇
            </h3>
            <div className="bg-sky-50 dark:bg-dark-card rounded-xl p-3">
              <div className="text-sm text-sky-700 dark:text-sky-300">
                本词库包含 <span className="font-bold">2,378</span> 个 TEM-4（专业四级）词汇和 <span className="font-bold">3,418</span> 个 TEM-8（专业八级）词汇，适合英语专业学生备考使用。
              </div>
            </div>
          </div>

          {/* 数据来源 */}
          <div className="flex items-start gap-2 text-xs text-gray-400 dark:text-dark-muted bg-gray-50 dark:bg-dark-hover rounded-xl p-3">
            <Info size={14} className="mt-0.5 shrink-0" />
            <div>
              数据来源：github.com/Ceelog/DictionaryByGPT4（GPT-4 生成解析）<br/>
              四六级词表：github.com/KyleBing/english-vocabulary<br/>
              专四专八词表：github.com/mahavivo/english-wordlists<br/>
              补充释义：skywind3000/ECDICT + kajweb/dict（有道词典）
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsView({ totalWords, favoritesCount, onClearHistory, onClearFavorites, isActivated, onOpenActivate, darkMode, onToggleDarkMode }) {
  const [showCoverage, setShowCoverage] = useState(false)

  const exportData = async () => {
    try {
      const data = {
        favorites: localStorage.getItem('gptwordbook_favorites') || '[]',
        history: localStorage.getItem('gptwordbook_history') || '[]',
        mastered: localStorage.getItem('gptwordbook_mastered') || '{}',
        plan: localStorage.getItem('gptwordbook_study_plan') || 'null',
        exportedAt: new Date().toISOString(),
      }
      const fileName = 'gpt-wordbook-backup.json'
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('导出失败：' + (e.message || '未知错误'))
    }
  }

  const importData = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result)
          if (data.favorites) localStorage.setItem('gptwordbook_favorites', data.favorites)
          if (data.history) localStorage.setItem('gptwordbook_history', data.history)
          if (data.mastered) localStorage.setItem('gptwordbook_mastered', data.mastered)
          if (data.plan) localStorage.setItem('gptwordbook_study_plan', data.plan)
          alert('学习记录已导入，请重启 App')
        } catch (err) {
          alert('导入失败：文件格式错误')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="p-4">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
        <button
          onClick={() => setShowCoverage(true)}
          className="w-full p-4 border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover transition text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500 dark:text-dark-muted">词库总量</div>
              <div className="text-2xl font-bold text-sky-500">{totalWords.toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-1 text-sky-500 text-sm">
              <BarChart3 size={16} />
              <span>查看覆盖率</span>
            </div>
          </div>
        </button>
        <div className="p-4">
          <div className="text-sm text-gray-500 dark:text-dark-muted">已收藏</div>
          <div className="text-2xl font-bold text-sky-500">{favoritesCount}</div>
        </div>
      </div>

      {/* 深色模式开关 */}
      <div className="mt-4">
        <button
          onClick={onToggleDarkMode}
          className="w-full p-4 border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover transition text-left flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-dark-hover flex items-center justify-center">
              <Moon size={18} className="text-gray-600 dark:text-dark-text" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-dark-text">深色模式</div>
              <div className="text-xs text-gray-500 dark:text-dark-muted">{darkMode ? '已开启' : '已关闭'}</div>
            </div>
          </div>
          <div className={`w-12 h-6 rounded-full transition ${darkMode ? 'bg-gray-700' : 'bg-gray-300'} relative`}>
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition ${darkMode ? 'left-6' : 'left-0.5'}`} />
          </div>
        </button>
      </div>

      <div className="mt-6 bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
        <button
          onClick={onOpenActivate}
          className={`w-full p-4 text-left border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover transition flex items-center justify-between ${isActivated ? 'text-green-600' : 'text-yellow-600'}`}
        >
          <span>激活授权</span>
          <span className="text-sm font-medium">{isActivated ? '已激活' : '未激活'}</span>
        </button>
        <button
          onClick={exportData}
          className="w-full p-4 text-left text-sky-600 border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover transition"
        >
          导出学习记录
        </button>
        <button
          onClick={importData}
          className="w-full p-4 text-left text-sky-600 border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover transition"
        >
          导入学习记录
        </button>
        <button
          onClick={() => { if (confirm('确定要清空浏览历史吗？')) onClearHistory() }}
          className="w-full p-4 text-left text-red-500 border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover transition"
        >
          清空浏览历史
        </button>
        <button
          onClick={() => { if (confirm('确定要清空所有收藏吗？')) onClearFavorites() }}
          className="w-full p-4 text-left text-red-500 hover:bg-gray-50 dark:hover:bg-dark-hover transition"
        >
          清空收藏
        </button>
      </div>

      <div className="mt-6 text-center text-xs text-gray-400 dark:text-dark-muted">
        <p>GPT 单词本 v2.0.0</p>
        <p className="mt-1">新增音标显示 + TTS 发音</p>
        <p className="mt-1">数据来源: github.com/Ceelog/DictionaryByGPT4</p>
      </div>

      {showCoverage && <CoverageReport onClose={() => setShowCoverage(false)} />}
    </div>
  )
}

// 发音音频缓存（同一个单词只请求一次有道 API）
const audioCache = {}

function WordDetail({ wordData, onBack, isFavorite, onToggleFavorite, ttsReady, onPrev, onNext }) {
  const [speaking, setSpeaking] = useState(false)
  const audioRef = useRef(null)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const touchDeltaX = useRef(0)
  const [swiping, setSwiping] = useState(false)

  // 触摸手势处理
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchDeltaX.current = 0
    setSwiping(false)
  }

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return
    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current)
    // 只在水平滑动大于垂直滑动时触发
    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 20) {
      setSwiping(true)
      touchDeltaX.current = deltaX
    }
  }

  const handleTouchEnd = () => {
    if (touchStartX.current === null) return
    const threshold = 80
    if (touchDeltaX.current < -threshold && onNext) {
      onNext()
    } else if (touchDeltaX.current > threshold && onPrev) {
      onPrev()
    }
    touchStartX.current = null
    touchStartY.current = null
    touchDeltaX.current = 0
    setSwiping(false)
  }

  const speak = () => {
    if (speaking) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setSpeaking(true)

    // 优先使用缓存
    if (audioCache[wordData.word]) {
      const audio = new Audio(audioCache[wordData.word])
      audioRef.current = audio
      audio.onended = () => setSpeaking(false)
      audio.onerror = () => setSpeaking(false)
      audio.play()
      return
    }

    // 从有道词典获取真人发音并缓存
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(wordData.word)}&type=2`
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => setSpeaking(false)
    audio.onerror = () => {
      console.warn('Youdao TTS failed, no fallback available')
      setSpeaking(false)
    }
    // 缓存音频 URL（浏览器会自动缓存音频数据）
    audioCache[wordData.word] = url
    audio.play()
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  return (
    <div
      className="h-screen flex flex-col bg-gray-50 dark:bg-dark-bg"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      <header className="bg-sky-500 dark:bg-dark-card text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-sky-400 transition">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold truncate max-w-[200px]">{wordData.word}</h1>
          <button onClick={onToggleFavorite} className="p-2 -mr-2 rounded-full hover:bg-sky-400 transition">
            <Star size={22} className={isFavorite ? 'text-yellow-300 fill-yellow-300' : 'text-white'} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4" style={{ touchAction: 'pan-y' }}>
        <div className="bg-white dark:bg-dark-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-dark-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-3xl font-bold text-gray-900 dark:text-dark-text">{wordData.word}</div>
            <LevelTag word={wordData.word} />
            <button
              onClick={speak}
              className={`p-2 rounded-full transition ${speaking ? 'bg-sky-500 text-white animate-pulse' : 'bg-sky-50 text-sky-500 hover:bg-sky-100'}`}
              title="播放发音"
            >
              <Volume2 size={20} />
            </button>
          </div>
          {wordData.ipa && (
            <div className="text-lg text-sky-500 font-mono mb-4">
              /{wordData.ipa}/
            </div>
          )}
          <div className="markdown-content text-sm dark:text-dark-text">
            <ReactMarkdown>{wordData.content || ''}</ReactMarkdown>
          </div>
        </div>

        {/* 滑动提示 */}
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-300 dark:text-gray-600">
          {onPrev && <span>&lt; 左滑返回</span>}
          {onNext && <span>右滑下一个 &gt;</span>}
        </div>
      </div>
    </div>
  )
}

export default App
