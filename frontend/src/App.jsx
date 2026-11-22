import { Component, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Award, BookOpen, ChevronRight, GraduationCap, LayoutDashboard, LogOut, Menu, PlayCircle, Search, Settings, Trophy, Users } from 'lucide-react'
import './App.css'

const AuthContext = createContext(null)

function storedToken() {
  try {
    return localStorage.getItem('token')
  } catch {
    return null
  }
}

function storedUser() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (!user || !Number.isInteger(user.id) || !user.name || !user.email || !['student', 'tutor', 'admin'].includes(user.role)) return null
    return user
  } catch {
    try {
      localStorage.removeItem('user')
    } catch {
      console.warn('Could not clear malformed browser profile data.')
    }
    return null
  }
}

function api(path, options = {}) {
  const token = storedToken()
  return fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || 'Something went wrong')
      error.status = response.status
      throw error
    }
    return data
  })
}

function formatCourseMeta(course) {
  const parts = []
  if (course.domain) parts.push(course.domain)
  if (course.category && course.category !== course.domain) parts.push(course.category)
  const level = course.level || course.course_level
  if (level) parts.push(level)
  return parts.join(' · ')
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(storedToken()))
  useEffect(() => {
    if (!storedToken()) {
      try {
        localStorage.removeItem('user')
      } catch {
        console.warn('Could not clear malformed browser profile data.')
      }
      return
    }
    api('/auth/me')
      .then((currentUser) => {
        setUser(currentUser)
        try {
          localStorage.setItem('user', JSON.stringify(currentUser))
        } catch {
          console.warn('Could not update the cached user profile.')
        }
      })
      .catch((error) => {
        if (error.status === 401 || error.status === 403) {
          setUser(null)
          try {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
          } catch {
            console.warn('Could not clear the expired session from browser storage.')
          }
        } else {
          setUser(storedUser())
          console.error('Could not verify the saved CourseHub session:', error)
        }
      })
      .finally(() => setLoading(false))
  }, [])
  const login = (data) => {
    try {
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
    } catch {
      throw new Error('Browser storage is unavailable. Enable site storage and try again.')
    }
    setUser(data.user)
  }
  const logout = () => {
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    } catch {
      console.warn('Could not clear the browser session.')
    }
    setUser(null)
  }
  const updateUser = (updatedUser) => {
    setUser(updatedUser)
    try {
      localStorage.setItem('user', JSON.stringify(updatedUser))
    } catch {
      console.warn('Could not update the cached user profile.')
    }
  }
  return <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>{children}</AuthContext.Provider>
}

function useAuth() {
  return useContext(AuthContext)
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="loading">Restoring your secure session...</main>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const dashboard = user?.role === 'tutor' ? '/tutor' : user?.role === 'admin' ? '/admin' : '/dashboard'
  const signOut = () => {
    logout()
    navigate('/')
  }
  return (
    <nav className="navbar">
      <Link className="brand" to="/" onClick={() => setOpen(false)}>
        <span className="brand-mark"><PlayCircle size={21} /></span>
        <span>CourseHub</span>
      </Link>
      <button className="menu-button" aria-label="Toggle navigation" onClick={() => setOpen(!open)}><Menu /></button>
      <div className={`nav-links ${open ? 'open' : ''}`}>
        <Link to="/courses" onClick={() => setOpen(false)}>Explore</Link>
        {user ? (
          <>
            <Link to={dashboard} onClick={() => setOpen(false)}>Dashboard</Link>
            {user.role === 'student' && <Link to="/my-courses" onClick={() => setOpen(false)}>My learning</Link>}
            <Link to="/profile" onClick={() => setOpen(false)}>Profile</Link>
            <span className="nav-user">{user.name}</span>
            <button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={18} /></button>
          </>
        ) : (
          <>
            <Link to="/login" onClick={() => setOpen(false)}>Log in</Link>
            <Link className="button small" to="/register" onClick={() => setOpen(false)}>Get started</Link>
          </>
        )}
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer>
      <Link className="brand footer-brand" to="/"><span className="brand-mark"><PlayCircle size={20} /></span><span>CourseHub</span></Link>
      <p>Learn practical skills at your own pace.</p>
      <div className="footer-links"><Link to="/about">About</Link><Link to="/contact">Contact</Link></div>
      <span>© 2026 CourseHub</span>
    </footer>
  )
}

function Home() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState([])
  const [domains, setDomains] = useState([])
  const [domainError, setDomainError] = useState('')
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [stats, setStats] = useState({ students: 0, courses: 0, average_rating: 0 })
  const navigate = useNavigate()
  useEffect(() => {
    api('/courses').then(setCourses).finally(() => setLoading(false)).catch(() => setLoading(false))
    api('/categories').then(setCategories).catch(() => setCategories([]))
    api('/domains')
      .then(setDomains)
      .catch((error) => setDomainError(error.message))
      .finally(() => setDomainsLoading(false))
    api('/stats').then(setStats).catch(() => setStats({ students: 0, courses: 0, average_rating: 0 }))
  }, [])
  const featured = courses[0]
  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">Learn without limits</span>
          <h1>Build skills that move you <em>forward.</em></h1>
          <p>Explore expert-led courses and learn practical skills at your own pace.</p>
          <div className="hero-actions">
            <Link className="button" to="/courses">Browse courses <ChevronRight size={17} /></Link>
            <Link className="text-link" to="/register">Start learning free</Link>
          </div>
          <form className="home-search" onSubmit={(event) => { event.preventDefault(); navigate(`/courses?search=${encodeURIComponent(search)}`) }}>
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="What do you want to learn?" />
            <button type="submit">Search</button>
          </form>
          <div className="trust-row"><span><b>{stats.students.toLocaleString()}</b> learners</span><span><b>{stats.courses.toLocaleString()}</b> courses</span><span><b>{Number(stats.average_rating).toFixed(1)}</b> average rating</span></div>
        </div>
        <div className="hero-art">
          <div className="art-card main-card">
            <div className="art-top"><span>Featured course</span><span>{featured ? `${featured.students} learners` : 'New courses weekly'}</span></div>
            <div className="art-cover"><PlayCircle size={54} /></div>
            <h3>{featured?.title || 'Learn something new today'}</h3>
            <div className="progress-track"><span style={{ width: '72%' }} /></div>
            <div className="progress-label"><span>Course progress</span><b>72%</b></div>
          </div>
          <div className="floating-card certificate"><Award size={22} /><div><b>Certificate earned</b><span>React Fundamentals</span></div></div>
        </div>
      </section>
      <section className="category-section">
        <div className="section-heading">
          <div><span className="eyebrow">Browse by topic</span><h2>Explore course categories</h2></div>
        </div>
        <div className="category-grid">
          {categories.map((category, index) => (
            <button className="category-card" key={category.id} onClick={() => navigate(`/courses?category=${encodeURIComponent(category.name)}`)}>
              <span>{['</>', 'Aa', 'B', 'M', 'Cam', '↑'][index % 6]}</span>
              <b>{category.name}</b>
              <small>Explore courses</small>
            </button>
          ))}
        </div>
      </section>
      {loading || domainsLoading ? <div className="loading">Loading domain courses...</div> : domainError ? (
        <div className="section"><div className="alert error-alert" role="alert">{domainError}</div></div>
      ) : domains.map((domain) => {
        const domainCourses = courses.filter((course) => course.domain_id === domain.id)
        return (
          <section className="section domain-section" key={domain.id}>
            <div className="section-heading">
              <div><span className="eyebrow">Learn by domain</span><h2>{domain.name} Courses</h2></div>
              <Link className="text-link" to={`/courses?domain_id=${domain.id}`}>View All <ChevronRight size={16} /></Link>
            </div>
            <div className="course-grid">
              {domainCourses.length ? domainCourses.map((course) => <CourseCard course={course} key={course.id} />) : (
                <EmptyState title="Courses are coming soon" text={`Approved ${domain.name} courses will appear here.`} />
              )}
            </div>
          </section>
        )
      })}
    </>
  )
}

function CourseCard({ course }) {
  return (
    <Link className="course-card" to={`/courses/${course.id}`}>
      <div className="course-cover" style={course.thumbnail_url ? { backgroundImage: `url(${course.thumbnail_url})` } : undefined}>
        {!course.thumbnail_url && <GraduationCap size={42} />}
        <span className="course-badge">{course.domain || 'Course'}</span>
      </div>
      <div className="course-content">
        <h3>{course.title}</h3>
        <p>{course.description || 'Learn practical skills through clear, focused lessons.'}</p>
        <div className="course-meta"><span>{course.tutor_name}</span><b>{course.price > 0 ? `$${Number(course.price).toFixed(2)}` : 'Free'}</b></div>
        <span className="course-level">{course.category || 'General'} · {course.level || 'All levels'}</span>
      </div>
    </Link>
  )
}

function YouTubePlayer({ videoId, title }) {
  const [unavailable, setUnavailable] = useState(false)
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
  return (
    <div className="youtube-player">
      {unavailable && <div className="alert error-alert" role="status">This video could not be embedded. You can watch it on YouTube instead.</div>}
      <div className="youtube-frame">
        <iframe
          src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setUnavailable(true)}
        />
      </div>
      <a className="youtube-fallback" href={youtubeUrl} target="_blank" rel="noreferrer">Watch on YouTube</a>
    </div>
  )
}

function AuthPage({ mode }) {
  const { login, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState('student')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!authLoading && user) {
      navigate(user.role === 'tutor' ? '/tutor' : user.role === 'admin' ? '/admin' : '/dashboard', { replace: true })
    }
  }, [authLoading, user, navigate])
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api(mode === 'register' ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(mode === 'register' ? { ...form, role } : { email: form.email, password: form.password }),
      })
      login(data)
      navigate(data.user.role === 'tutor' ? '/tutor' : data.user.role === 'admin' ? '/admin' : '/dashboard')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }
  if (authLoading) return <main className="loading">Restoring your secure session...</main>
  if (user) return <main className="loading">Opening your dashboard...</main>
  return (
    <main className="auth-layout">
      <section className="auth-aside"><Link className="brand light" to="/"><span className="brand-mark"><PlayCircle size={21} /></span><span>CourseHub</span></Link><div><span className="eyebrow">Keep growing</span><h1>{mode === 'register' ? 'Start your learning journey.' : 'Welcome back.'}</h1><p>{mode === 'register' ? 'Create an account and learn from expert tutors.' : 'Continue where you left off.'}</p></div></section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h2>{mode === 'register' ? 'Create your account' : 'Log in to CourseHub'}</h2>
          {error && <div className="alert error-alert">{error}</div>}
          {mode === 'register' && <label>Full name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Morgan" /></label>}
          <label>Email address<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
          <label>Password<input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></label>
          {mode === 'register' && <div className="role-select"><span>I am joining as</span><div><button type="button" className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}><GraduationCap />Student</button><button type="button" className={role === 'tutor' ? 'active' : ''} onClick={() => setRole('tutor')}><Users />Tutor</button></div></div>}
          <button className="button auth-button" disabled={loading}>{loading ? 'Please wait...' : mode === 'register' ? 'Create account' : 'Log in'}</button>
          <p className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to CourseHub?'} <Link to={mode === 'register' ? '/login' : '/register'}>{mode === 'register' ? 'Log in' : 'Create account'}</Link></p>
        </form>
      </section>
    </main>
  )
}

function CoursesPage() {
  const [courses, setCourses] = useState([])
  const [categories, setCategories] = useState([])
  const [domains, setDomains] = useState([])
  const [searchParams, setSearchParams] = useSearchParams()
  const querySearch = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const domainId = searchParams.get('domain_id') || ''
  const [searchDraft, setSearchDraft] = useState({ query: querySearch, value: querySearch })
  const search = searchDraft.query === querySearch ? searchDraft.value : querySearch
  const setSearch = (value) => setSearchDraft({ query: querySearch, value })
  const [loadedQuery, setLoadedQuery] = useState(null)
  const queryKey = JSON.stringify([querySearch, category, domainId])
  const loading = loadedQuery !== queryKey
  useEffect(() => {
    const params = new URLSearchParams()
    if (querySearch) params.set('search', querySearch)
    if (category) params.set('category', category)
    if (domainId) params.set('domain_id', domainId)
    let active = true
    api(`/courses${params.toString() ? `?${params}` : ''}`)
      .then((data) => { if (active) setCourses(data) })
      .catch(() => { if (active) setCourses([]) })
      .finally(() => { if (active) setLoadedQuery(queryKey) })
    return () => { active = false }
  }, [querySearch, category, domainId, queryKey])
  useEffect(() => {
    api('/categories').then(setCategories).catch(() => setCategories([]))
    api('/domains').then(setDomains).catch(() => setDomains([]))
  }, [])
  const updateDomain = (selectedDomainId) => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (category) params.set('category', category)
    if (selectedDomainId) params.set('domain_id', selectedDomainId)
    setSearchParams(params)
  }
  const updateCategory = (selectedCategory) => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (domainId) params.set('domain_id', domainId)
    if (selectedCategory) params.set('category', selectedCategory)
    setSearchParams(params)
  }
  const submitSearch = (event) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (domainId) params.set('domain_id', domainId)
    if (category) params.set('category', category)
    setSearchParams(params)
  }
  return (
    <main className="page">
      <div className="page-heading"><div><span className="eyebrow">Course catalog</span><h1>Explore courses</h1></div></div>
      <div className="catalog-filter-group">
        <span className="catalog-filter-label">Domain</span>
        <div className="catalog-filters">
          <button className={!domainId ? 'active' : ''} onClick={() => updateDomain('')}>All domains</button>
          {domains.map((domain) => (
            <button key={domain.id} className={domainId === String(domain.id) ? 'active' : ''} onClick={() => updateDomain(String(domain.id))}>{domain.name}</button>
          ))}
        </div>
      </div>
      <div className="catalog-filter-group">
        <span className="catalog-filter-label">Category</span>
        <div className="catalog-filters">
          <button className={!category ? 'active' : ''} onClick={() => updateCategory('')}>All categories</button>
        {['', ...categories.map((item) => item.name)].map((item) => (
            item && <button key={item} className={category === item ? 'active' : ''} onClick={() => updateCategory(item)}>{item}</button>
        ))}
        </div>
      </div>
      <form className="search-row" onSubmit={submitSearch}>
        <Search size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search courses..." /><button className="button" type="submit">Search</button>
      </form>
      {loading ? <div className="loading">Loading courses...</div> : <div className="course-grid">{courses.map((course) => <CourseCard course={course} key={course.id} />)}</div>}
      {!loading && !courses.length && <EmptyState title="No courses found" text="Try a different search." />}
    </main>
  )
}

function CourseDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [message, setMessage] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [notFound, setNotFound] = useState(false)
  useEffect(() => {
    api(`/courses/${id}`)
      .then((data) => {
        setCourse(data)
        setNotFound(false)
      })
      .catch((error) => {
        setCourse(null)
        setNotFound(error.message === 'Course not found')
      })
  }, [id])
  const enroll = async () => {
    if (!user) return navigate('/login')
    try {
      await api(`/courses/${id}/enroll`, { method: 'POST' })
      setCourse((current) => ({ ...current, is_enrolled: true }))
      setMessage('You are enrolled!')
      api(`/courses/${id}`)
        .then(setCourse)
        .catch((error) => setMessage(`Enrollment succeeded, but course access could not be refreshed: ${error.message}`))
    } catch (error) {
      setMessage(error.message)
    }
  }
  const submitReview = async (event) => {
    event.preventDefault()
    if (!user) return navigate('/login')
    try {
      await api(`/courses/${id}/reviews`, { method: 'POST', body: JSON.stringify({ rating: reviewRating, comment: reviewComment }) })
      setMessage('Review submitted.')
      setReviewComment('')
      api(`/courses/${id}`).then(setCourse)
    } catch (error) { setMessage(error.message) }
  }
  if (!course) return <main className="page">{notFound ? <EmptyState title="Course not found" text="This course may be unavailable or not yet approved." /> : <div className="loading">Loading course...</div>}</main>
  return (
    <main className="course-detail">
      <section className="detail-header"><div><span className="eyebrow">{formatCourseMeta(course) || 'Course'}</span><h1>{course.title}</h1><p>{course.description}</p><div className="detail-tutor">Created by <b>{course.tutor_name}</b></div></div></section>
      <div className="detail-layout">
        <section className="detail-main">
          {course.youtube_video_id && (
            <section className="youtube-preview">
              <h2>Course video</h2>
              <YouTubePlayer key={course.youtube_video_id} videoId={course.youtube_video_id} title={course.title} />
            </section>
          )}
          <h2>Course content</h2>
          {course.modules?.length ? course.modules.map((module, index) => <div className="module" key={module.id}><div className="module-title"><b>{index + 1}. {module.title}</b><span>{module.lessons?.length || 0} lessons</span></div>{module.lessons?.map((lesson) => <div className="lesson-row" key={lesson.id}><PlayCircle size={17} /><span>{lesson.title}</span></div>)}</div>) : <EmptyState title="Content is being prepared" text="The tutor is adding lessons." />}
          {course.reviews?.length > 0 && <section className="reviews"><h2>Student reviews</h2>{course.reviews.map((review, index) => <div className="review" key={index}><b>{review.student_name}</b><span>{'★'.repeat(review.rating)}</span><p>{review.comment}</p></div>)}</section>}
          {user?.role === 'student' && (
            <form className="review-form" onSubmit={submitReview}>
              <h2>Write a review</h2>
              <label>Rating
                <select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}>
                  {[5,4,3,2,1].map((rating) => <option value={rating} key={rating}>{rating} stars</option>)}
                </select>
              </label>
              <label>Your comment<textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Share your experience" /></label>
              <button className="button" type="submit">Submit review</button>
            </form>
          )}
        </section>
        <aside className="detail-card"><div className="detail-cover">{course.thumbnail_url ? <img src={course.thumbnail_url} alt="" /> : <GraduationCap size={64} />}</div><div className="detail-price">{course.price > 0 ? `$${Number(course.price).toFixed(2)}` : 'Free'}</div>{course.is_enrolled ? <Link className="button full" to={`/learn/${id}`}>Continue learning</Link> : <button className="button full" onClick={enroll}>Enroll now</button>}{message && <div className="alert">{message}</div>}<div className="detail-facts"><span><b>{course.modules?.reduce((sum, module) => sum + (module.lessons?.length || 0), 0)}</b> lessons</span><span><b>Lifetime</b> access</span><span><b>Certificate</b> on completion</span></div></aside>
      </div>
    </main>
  )
}

function DashboardLayout({ title, children, active }) {
  const { user } = useAuth()
  const base = user?.role === 'tutor' ? '/tutor' : user?.role === 'admin' ? '/admin' : '/dashboard'
  return (
    <main className="dashboard-layout">
      <aside className="sidebar"><div className="sidebar-profile"><span>{user?.name?.charAt(0)}</span><div><b>{user?.name}</b><small>{user?.role}</small></div></div><nav><Link className={active === 'dashboard' ? 'active' : ''} to={base}><LayoutDashboard size={19} />Overview</Link>{user?.role === 'student' && <><Link className={active === 'courses' ? 'active' : ''} to="/my-courses"><BookOpen size={19} />My courses</Link><Link className={active === 'progress' ? 'active' : ''} to="/progress"><Trophy size={19} />Progress</Link><Link className={active === 'certificates' ? 'active' : ''} to="/certificates"><Award size={19} />Certificates</Link></>}{user?.role === 'tutor' && <Link className={active === 'courses' ? 'active' : ''} to="/tutor"><BookOpen size={19} />My courses</Link>}{user?.role === 'admin' && <Link className={active === 'courses' ? 'active' : ''} to="/admin"><Settings size={19} />Manage platform</Link>}<Link className={active === 'profile' ? 'active' : ''} to="/profile"><Users size={19} />Profile</Link></nav></aside>
      <section className="dashboard-main"><div className="dashboard-heading"><h1>{title}</h1></div>{children}</section>
    </main>
  )
}

function StudentDashboard() {
  const [courses, setCourses] = useState([])
  useEffect(() => {
    api('/my-courses').then(setCourses).catch(() => setCourses([]))
  }, [])
  const average = courses.length ? Math.round(courses.reduce((sum, course) => sum + course.progress, 0) / courses.length) : 0
  return <DashboardLayout title="Learning overview" active="dashboard"><div className="stat-grid"><StatCard label="Enrolled courses" value={courses.length} icon={<BookOpen />} /><StatCard label="Average progress" value={`${average}%`} icon={<Trophy />} /><StatCard label="Completed" value={courses.filter((course) => course.progress === 100).length} icon={<Award />} /></div><h2 className="dashboard-section-title">Continue learning</h2>{courses.length ? <div className="learning-list">{courses.map((course) => <Link className="learning-card" to={`/learn/${course.id}`} key={course.id}><div className="learning-cover" style={course.thumbnail_url ? { backgroundImage: `url(${course.thumbnail_url})` } : undefined}>{!course.thumbnail_url && <PlayCircle />}</div><div><h3>{course.title}</h3><p>{formatCourseMeta(course)}</p><p>{course.completed_lessons} of {course.total_lessons} lessons</p><div className="progress-track"><span style={{ width: `${course.progress}%` }} /></div></div><b>{course.progress}%</b></Link>)}</div> : <EmptyState title="Start learning" text="Browse courses and enroll to begin." />}</DashboardLayout>
}

function StatCard({ label, value, icon }) {
  return <div className="stat-card"><div className="stat-icon">{icon}</div><div><span>{label}</span><b>{value}</b></div></div>
}

function MyCourses() {
  const [courses, setCourses] = useState([])
  useEffect(() => {
    api('/my-courses').then(setCourses).catch(() => setCourses([]))
  }, [])
  return <DashboardLayout title="My courses" active="courses"><div className="learning-list">{courses.map((course) => <Link className="learning-card" to={`/learn/${course.id}`} key={course.id}><div className="learning-cover" style={course.thumbnail_url ? { backgroundImage: `url(${course.thumbnail_url})` } : undefined}>{!course.thumbnail_url && <PlayCircle />}</div><div><h3>{course.title}</h3><p>{formatCourseMeta(course)}</p><p>{course.completed_lessons} of {course.total_lessons} lessons completed</p><div className="progress-track"><span style={{ width: `${course.progress}%` }} /></div></div><b>{course.progress}%</b></Link>)}</div>{!courses.length && <EmptyState title="No enrolled courses" text="Explore the course catalog to get started." />}</DashboardLayout>
}

function ProgressPage() {
  const [courses, setCourses] = useState([])
  useEffect(() => {
    api('/my-courses').then(setCourses).catch(() => setCourses([]))
  }, [])
  return <DashboardLayout title="Learning progress" active="progress"><div className="progress-page">{courses.map((course) => <div className="progress-card" key={course.id}><div><h3>{course.title}</h3><span>{formatCourseMeta(course)}</span><span>{course.completed_lessons} / {course.total_lessons} lessons</span></div><div className="progress-ring" style={{ '--progress': `${course.progress * 3.6}deg` }}>{course.progress}%</div></div>)}</div>{!courses.length && <EmptyState title="No progress yet" text="Enroll in a course to track your progress." />}</DashboardLayout>
}

function CertificatePage() {
  const [certificates, setCertificates] = useState([])
  useEffect(() => {
    api('/certificates').then(setCertificates).catch(() => setCertificates([]))
  }, [])
  return <DashboardLayout title="My certificates" active="certificates"><div className="certificate-grid">{certificates.map((certificate) => <article className="certificate-card" key={certificate.id}><div className="certificate-preview"><Award size={44} /><b>Certificate of Completion</b><span>{certificate.course_name}</span></div><h3>{certificate.course_name}</h3><a className="button small" href={certificate.pdf_url} download target="_blank" rel="noreferrer">Download PDF</a></article>)}</div>{!certificates.length && <EmptyState title="No certificates yet" text="Complete all lessons in a course to earn one." />}</DashboardLayout>
}

function ProfilePage() {
  const { updateUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', current_password: '', new_password: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api('/profile').then((data) => {
      setProfile(data)
      setForm((current) => ({ ...current, name: data.name, email: data.email }))
    }).catch((requestError) => setError(requestError.message))
  }, [])
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const updated = await api('/profile', { method: 'PUT', body: JSON.stringify(form) })
      setProfile(updated)
      updateUser(updated)
      setForm((current) => ({ ...current, current_password: '', new_password: '' }))
      setMessage('Profile updated successfully.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <DashboardLayout title="Your profile" active="profile">
      {error && <div className="alert error-alert" role="alert">{error}</div>}
      {message && <div className="alert success-alert" role="status">{message}</div>}
      <form className="profile-form" onSubmit={submit}>
        <div className="profile-heading"><span>{profile?.name?.charAt(0) || '?'}</span><div><h2>{profile?.name || 'Loading profile...'}</h2><p>{profile?.role}</p></div></div>
        <label>Full name<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Email address<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <h3>Change password <small>(optional)</small></h3>
        <label>Current password<input type="password" autoComplete="current-password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} /></label>
        <label>New password<input type="password" minLength={8} autoComplete="new-password" value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} /></label>
        <button className="button" disabled={saving || !profile}>{saving ? 'Saving...' : 'Save profile'}</button>
      </form>
    </DashboardLayout>
  )
}

function AboutPage() {
  return (
    <main className="info-page">
      <span className="eyebrow">About CourseHub</span>
      <h1>Learning that moves you forward.</h1>
      <p>CourseHub connects curious learners with tutors who create practical, structured video courses. Learn at your own pace, track your progress, and earn certificates when you complete your learning journey.</p>
      <div className="about-values">
        <article><BookOpen /><h2>Learn by doing</h2><p>Clear lessons organized into focused modules.</p></article>
        <article><Users /><h2>Learn together</h2><p>Independent tutors share their expertise with students.</p></article>
        <article><Award /><h2>Show your progress</h2><p>Track completed lessons and earn course certificates.</p></article>
      </div>
      <Link className="button" to="/courses">Explore courses</Link>
    </main>
  )
}

function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSending(true)
    try {
      const result = await api('/contact', { method: 'POST', body: JSON.stringify(form) })
      setSuccess(result.message)
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSending(false)
    }
  }
  return (
    <main className="info-page contact-page">
      <span className="eyebrow">Contact us</span>
      <h1>We’re here to help.</h1>
      <p>Send our CourseHub team a message and we’ll get back to you.</p>
      <form className="contact-form" onSubmit={submit}>
        {error && <div className="alert error-alert" role="alert">{error}</div>}
        {success && <div className="alert success-alert" role="status">{success}</div>}
        <label>Your name<input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Email address<input required type="email" maxLength={255} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Subject<input required minLength={3} maxLength={180} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
        <label>Message<textarea required minLength={10} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
        <button className="button" disabled={sending}>{sending ? 'Sending...' : 'Send message'}</button>
      </form>
    </main>
  )
}

function LearnPage() {
  const { id } = useParams()
  const [course, setCourse] = useState(null)
  const [progress, setProgress] = useState(null)
  const [active, setActive] = useState(null)
  const [playerError, setPlayerError] = useState('')
  const [loadedId, setLoadedId] = useState(null)
  const loading = loadedId !== id
  const videoRef = useRef(null)
  const lastProgressSaved = useRef(0)
  useEffect(() => {
    let activeRequest = true
    lastProgressSaved.current = 0
    Promise.allSettled([api(`/courses/${id}`), api(`/courses/${id}/progress`)]).then(([courseResult, progressResult]) => {
      if (!activeRequest) return
      const nextCourse = courseResult.status === 'fulfilled' ? courseResult.value : null
      const nextProgress = progressResult.status === 'fulfilled' ? progressResult.value : null
      setCourse(nextCourse)
      setProgress(nextProgress)
      setActive(nextProgress?.lessons.find((lesson) => lesson.video_url) || nextProgress?.lessons[0] || null)
      setPlayerError(courseResult.status === 'rejected' ? courseResult.reason.message : progressResult.status === 'rejected' ? progressResult.reason.message : '')
      setLoadedId(id)
    })
    return () => { activeRequest = false }
  }, [id])
  const saveProgress = async (completed = false, positionOverride = null) => {
    if (!active) return
    const position = positionOverride ?? videoRef.current?.currentTime ?? active.last_position_seconds ?? 0
    const data = await api(`/lessons/${active.id}/progress`, { method: 'PUT', body: JSON.stringify({ position: Math.round(position), completed }) })
    setProgress((previous) => ({
      ...previous,
      progress: data.progress,
      lessons: previous.lessons.map((lesson) => lesson.id === active.id
        ? { ...lesson, last_position_seconds: Math.round(position), is_completed: completed || lesson.is_completed }
        : lesson),
    }))
  }
  const selectLesson = async (lesson) => {
    if (active && videoRef.current) {
      try {
        await saveProgress(false, videoRef.current.currentTime)
      } catch (error) {
        setPlayerError(error.message)
      }
    }
    lastProgressSaved.current = 0
    setActive(lesson)
  }
  if (loading) return <main className="page"><div className="loading">Loading lesson...</div></main>
  if (!course) return <main className="page"><div className="alert error-alert">{playerError || 'Course not found.'}</div><Link className="button" to="/courses">Browse courses</Link></main>
  if (!progress) return <main className="page">{playerError && <div className="alert error-alert">{playerError}</div>}<EmptyState title="Enroll to start learning" text="You need to enroll in this course before watching lessons." /><Link className="button" to={`/courses/${id}`}>View course and enroll</Link></main>
  return (
    <main className="player-page">
      <div className="player-main">
        <div className="player-header"><Link to="/my-courses">← My courses</Link><h1>{course.title}</h1><div className="progress-track"><span style={{ width: `${progress.progress || 0}%` }} /></div></div>
        {playerError && <div className="alert error-alert" role="alert">{playerError}</div>}
        <div className={`video-player ${course.youtube_video_id ? 'youtube-video-container' : ''}`}>
          {course.youtube_video_id ? (
            <YouTubePlayer key={course.youtube_video_id} videoId={course.youtube_video_id} title={course.title} />
          ) : active?.video_url ? (
            <video
              ref={videoRef}
              key={active.id}
              controls
              preload="metadata"
              src={active.video_url}
              onLoadedMetadata={(event) => {
                if (active.last_position_seconds) event.currentTarget.currentTime = active.last_position_seconds
                lastProgressSaved.current = active.last_position_seconds || 0
              }}
              onTimeUpdate={(event) => {
                const position = event.currentTarget.currentTime
                if (position - lastProgressSaved.current >= 10) {
                  lastProgressSaved.current = position
                  saveProgress(false, position).catch((error) => setPlayerError(error.message))
                }
              }}
              onPause={(event) => saveProgress(false, event.currentTarget.currentTime).catch((error) => setPlayerError(error.message))}
              onEnded={() => saveProgress(true).catch((error) => setPlayerError(error.message))}
            />
          ) : <div className="video-placeholder"><PlayCircle size={70} /><h2>{active?.title || 'Select a lesson'}</h2><p>The tutor has not uploaded a video yet.</p></div>}
        </div>
        {active && <button className="button mark-button" onClick={() => saveProgress(true).catch((error) => setPlayerError(error.message))}>Mark lesson complete</button>}
      </div>
      <aside className="lesson-sidebar"><h2>Course content</h2>{progress.lessons.map((lesson) => <button className={`lesson-item ${active?.id === lesson.id ? 'active' : ''}`} key={lesson.id} onClick={() => selectLesson(lesson)}><span className={lesson.is_completed ? 'complete' : ''}>{lesson.is_completed ? '✓' : <PlayCircle size={16} />}</span><div><small>{lesson.module_title}</small><b>{lesson.title}</b></div></button>)}</aside>
    </main>
  )
}

function TutorDashboard() {
  const [courses, setCourses] = useState([])
  const [domains, setDomains] = useState([])
  const [categories, setCategories] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', domain: 'Technology', category: 'Development', price: 0 })
  const [message, setMessage] = useState('')
  const load = () => api('/tutor/courses').then(setCourses).catch(() => setCourses([]))
  useEffect(() => {
    load()
    api('/domains').then(setDomains).catch((error) => setMessage(error.message))
    api('/categories').then(setCategories).catch((error) => setMessage(error.message))
  }, [])
  const create = async (event) => {
    event.preventDefault()
    try {
      await api('/courses', { method: 'POST', body: JSON.stringify(form) })
      setForm({ title: '', description: '', domain: 'Technology', category: 'Development', price: 0 })
      setShowForm(false)
      setMessage('Course created and sent for approval.')
      load()
    } catch (error) { setMessage(error.message) }
  }
  return <DashboardLayout title="Tutor dashboard" active="courses"><div className="dashboard-actions"><button className="button" onClick={() => setShowForm(!showForm)}>+ Create course</button></div>{message && <div className="alert">{message}</div>}{showForm && <form className="course-form" onSubmit={create}><label>Course title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Description<textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Domain<select value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })}>{domains.map((domain) => <option key={domain.id} value={domain.name}>{domain.name}</option>)}</select></label><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label><label>Price (0 for free)<input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label><button className="button" type="submit">Create course</button></form>}{courses.length > 0 && <div className="tutor-course-list">{courses.map((course) => <TutorCourse course={course} domains={domains} categories={categories} key={course.id} onChange={load} />)}</div>}{!courses.length && !showForm && <EmptyState title="Create your first course" text="Add a course, then modules and video lessons." />}</DashboardLayout>
}

function TutorCourse({ course, domains, categories, onChange }) {
  const [moduleTitle, setModuleTitle] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonEditId, setLessonEditId] = useState(null)
  const [lessonEditTitle, setLessonEditTitle] = useState('')
  const [selectedModule, setSelectedModule] = useState('')
  const [modules, setModules] = useState([])
  const [students, setStudents] = useState([])
  const [editing, setEditing] = useState(false)
  const [courseForm, setCourseForm] = useState({ title: course.title, description: course.description || '', domain: course.domain || 'General', category: course.category || 'Development', price: course.price || 0 })
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const refreshModules = useCallback(
    () => api(`/courses/${course.id}`).then((data) => setModules(data.modules || [])).catch(() => setModules([])),
    [course.id],
  )
  useEffect(() => {
    if (open) {
      refreshModules()
      api(`/tutor/courses/${course.id}/students`).then(setStudents).catch(() => setStudents([]))
    }
  }, [open, course.id, refreshModules])
  const addModule = async (event) => {
    event.preventDefault()
    try {
      await api(`/courses/${course.id}/modules`, { method: 'POST', body: JSON.stringify({ title: moduleTitle }) })
      setModuleTitle('')
      setMessage('Module added.')
      refreshModules()
    } catch (error) { setMessage(error.message) }
  }
  const addLesson = async (event) => {
    event.preventDefault()
    if (!selectedModule) return setMessage('Select a module first.')
    try {
      await api(`/modules/${selectedModule}/lessons`, { method: 'POST', body: JSON.stringify({ title: lessonTitle }) })
      setLessonTitle('')
      setMessage('Lesson added.')
      refreshModules()
    } catch (error) { setMessage(error.message) }
  }
  const saveLesson = async (event) => {
    event.preventDefault()
    try {
      await api(`/lessons/${lessonEditId}`, { method: 'PUT', body: JSON.stringify({ title: lessonEditTitle }) })
      setLessonEditId(null)
      setLessonEditTitle('')
      setMessage('Lesson updated.')
      refreshModules()
    } catch (error) { setMessage(error.message) }
  }
  const uploadThumbnail = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    try {
      await api(`/courses/${course.id}/thumbnail`, { method: 'POST', body: form })
      setMessage('Thumbnail uploaded.')
      onChange()
    } catch (error) { setMessage(error.message) }
  }
  const uploadVideo = async (lessonId, event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    try {
      await api(`/lessons/${lessonId}/video`, { method: 'POST', body: form })
      setMessage('Video uploaded.')
      refreshModules()
    } catch (error) { setMessage(error.message) }
  }
  const deleteCourse = async () => {
    if (window.confirm('Delete this course?')) {
      await api(`/courses/${course.id}`, { method: 'DELETE' })
      onChange()
    }
  }
  const deleteModule = async (moduleId) => {
    if (!window.confirm('Delete this module and its lessons?')) return
    await api(`/modules/${moduleId}`, { method: 'DELETE' })
    refreshModules()
  }
  const deleteLesson = async (lessonId) => {
    if (!window.confirm('Delete this lesson?')) return
    await api(`/lessons/${lessonId}`, { method: 'DELETE' })
    refreshModules()
  }
  const updateCourse = async (event) => {
    event.preventDefault()
    try {
      await api(`/courses/${course.id}`, { method: 'PUT', body: JSON.stringify(courseForm) })
      setEditing(false)
      setMessage('Course updated.')
      onChange()
    } catch (error) { setMessage(error.message) }
  }
  return (
    <article className="tutor-course">
      <div className="tutor-course-main">
        <div className="course-cover small">{course.thumbnail_url ? <img src={course.thumbnail_url} alt="" /> : <GraduationCap />}</div>
        <div><h3>{course.title}</h3><p>{course.description}</p><div className="course-inline-meta"><span>{formatCourseMeta(course)}</span><span className={`status-pill ${course.status}`}>{course.status}</span><span>{course.students} learners</span><span>{Number(course.average_rating || 0).toFixed(1)} ★ ({course.review_count || 0})</span></div></div>
      </div>
      <div className="tutor-course-actions">
        <label className="upload-button">Thumbnail<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadThumbnail} /></label>
        <button onClick={() => setEditing(!editing)}>Edit</button>
        <button onClick={() => setOpen(!open)}>Manage content</button>
        <button onClick={deleteCourse}>Delete</button>
      </div>
      {editing && (
        <form className="course-form tutor-edit-form" onSubmit={updateCourse}>
          <label>Course title<input value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} required /></label>
          <label>Description<textarea value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} /></label>
          <label>Domain<select value={courseForm.domain} onChange={(event) => setCourseForm({ ...courseForm, domain: event.target.value })}>{domains.map((domain) => <option key={domain.id} value={domain.name}>{domain.name}</option>)}</select></label>
          <label>Category<select value={courseForm.category} onChange={(event) => setCourseForm({ ...courseForm, category: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label>
          <label>Price (0 for free)<input type="number" min="0" step="0.01" value={courseForm.price} onChange={(event) => setCourseForm({ ...courseForm, price: event.target.value })} /></label>
          <button className="button" type="submit">Save changes</button>
        </form>
      )}
      {open && (
        <div className="course-manager">
          {message && <div className="alert">{message}</div>}
          <form onSubmit={addModule}>
            <input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} placeholder="New module title" required />
            <button type="submit">Add module</button>
          </form>
          <form onSubmit={addLesson} className="lesson-create">
            <select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)} required>
              <option value="">Select module</option>
              {modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}
            </select>
            <input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="New lesson title" required />
            <button type="submit">Add lesson</button>
          </form>
          {modules.map((module) => (
            <div className="managed-module" key={module.id}>
              <div className="managed-module-heading"><b>{module.title}</b><button type="button" onClick={() => deleteModule(module.id)}>Delete module</button></div>
              {module.lessons?.map((lesson) => (
                <div className="managed-lesson" key={lesson.id}>
                  {lessonEditId === lesson.id ? (
                    <form className="lesson-edit-form" onSubmit={saveLesson}>
                      <input value={lessonEditTitle} onChange={(event) => setLessonEditTitle(event.target.value)} required minLength={2} />
                      <button type="submit">Save</button>
                      <button type="button" onClick={() => setLessonEditId(null)}>Cancel</button>
                    </form>
                  ) : <span>{lesson.title}</span>}
                  <div className="lesson-actions">
                    <button type="button" onClick={() => { setLessonEditId(lesson.id); setLessonEditTitle(lesson.title) }}>Edit</button>
                    <label className="upload-button">Upload video<input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" onChange={(event) => uploadVideo(lesson.id, event)} /></label>
                    <button type="button" onClick={() => deleteLesson(lesson.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="student-monitor">
            <h3>Enrolled students</h3>
            {students.length ? students.map((student) => (
              <div className="student-row" key={student.id}><span><b>{student.name}</b><small>{student.email}</small></span><span>{student.completed}/{student.total_lessons} lessons · {student.total_lessons ? Math.round(student.completed / student.total_lessons * 100) : 0}%</span></div>
            )) : <p>No students enrolled yet.</p>}
          </div>
        </div>
      )}
    </article>
  )
}

function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [courses, setCourses] = useState([])
  const [messages, setMessages] = useState([])
  const [tab, setTab] = useState('courses')
  const load = () => {
    api('/admin/stats').then(setStats).catch(() => setStats(null))
    api('/admin/users').then(setUsers).catch(() => setUsers([]))
    api('/admin/courses').then(setCourses).catch(() => setCourses([]))
    api('/admin/contact-messages').then(setMessages).catch(() => setMessages([]))
  }
  useEffect(() => {
    load()
  }, [])
  const updateCourse = async (id, status) => {
    await api(`/admin/courses/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    load()
  }
  const updateUser = async (id, is_active) => {
    await api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active }) })
    load()
  }
  const deleteCourse = async (course) => {
    if (!window.confirm(`Permanently delete "${course.title}" and its course data?`)) return
    await api(`/courses/${course.id}`, { method: 'DELETE' })
    load()
  }
  return <DashboardLayout title="Admin dashboard" active="courses"><div className="stat-grid"><StatCard label="Students" value={stats?.students ?? 0} icon={<GraduationCap />} /><StatCard label="Tutors" value={stats?.tutors ?? 0} icon={<Users />} /><StatCard label="Courses" value={stats?.courses ?? 0} icon={<BookOpen />} /><StatCard label="Enrollments" value={stats?.enrollments ?? 0} icon={<Trophy />} /></div><div className="admin-tabs"><button className={tab === 'courses' ? 'active' : ''} onClick={() => setTab('courses')}>Courses</button><button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button><button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}>Contact messages</button></div>{tab === 'courses' ? <div className="admin-table"><div className="table-row table-head"><b>Course</b><b>Tutor / domain</b><b>Status</b><b>Action</b></div>{courses.map((course) => <div className="table-row" key={course.id}><span>{course.title}</span><span>{course.tutor_name}<small>{formatCourseMeta(course)}</small></span><span className={`status-pill ${course.status}`}>{course.status}</span><span><button onClick={() => updateCourse(course.id, 'approved')}>Approve</button><button onClick={() => updateCourse(course.id, 'rejected')}>Reject</button><button onClick={() => deleteCourse(course)}>Delete</button></span></div>)}</div> : tab === 'users' ? <div className="admin-table"><div className="table-row table-head"><b>User</b><b>Role</b><b>Status</b><b>Action</b></div>{users.map((user) => <div className="table-row" key={user.id}><span>{user.name}<small>{user.email}</small></span><span>{user.role}</span><span>{user.is_active ? 'Active' : 'Inactive'}</span><span><button onClick={() => updateUser(user.id, !user.is_active)}>{user.is_active ? 'Deactivate' : 'Activate'}</button></span></div>)}</div> : <div className="contact-inbox">{messages.length ? messages.map((message) => <article key={message.id}><b>{message.subject}</b><span>{message.name} · {message.email}</span><p>{message.message}</p><small>{new Date(message.created_at).toLocaleString()}</small></article>) : <EmptyState title="No messages" text="Contact form messages will appear here." />}</div>}</DashboardLayout>
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><BookOpen size={32} /><h3>{title}</h3><p>{text}</p></div>
}

function NotFoundPage() {
  return <><Navbar /><main className="page"><EmptyState title="Page not found" text="The page you requested does not exist." /><Link className="button" to="/">Go to CourseHub home</Link></main><Footer /></>
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('CourseHub interface error:', error, info)
  }

  render() {
    if (this.state.failed) {
      return <main className="error-screen"><h1>CourseHub could not load this page</h1><p>Your account and course data are safe. Reload the page or return home.</p><button className="button" onClick={() => window.location.assign('/')}>Return home</button></main>
    }
    return this.props.children
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<><Navbar /><main><Home /></main><Footer /></>} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/courses" element={<><Navbar /><CoursesPage /><Footer /></>} />
          <Route path="/courses/:id" element={<><Navbar /><CourseDetails /><Footer /></>} />
          <Route path="/dashboard" element={<ProtectedRoute roles={['student', 'admin']}><Navbar /><StudentDashboard /></ProtectedRoute>} />
          <Route path="/my-courses" element={<ProtectedRoute roles={['student', 'admin']}><Navbar /><MyCourses /></ProtectedRoute>} />
          <Route path="/progress" element={<ProtectedRoute roles={['student', 'admin']}><Navbar /><ProgressPage /></ProtectedRoute>} />
          <Route path="/certificates" element={<ProtectedRoute roles={['student', 'admin']}><Navbar /><CertificatePage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute roles={['student', 'tutor', 'admin']}><Navbar /><ProfilePage /></ProtectedRoute>} />
          <Route path="/about" element={<><Navbar /><AboutPage /><Footer /></>} />
          <Route path="/contact" element={<><Navbar /><ContactPage /><Footer /></>} />
          <Route path="/learn/:id" element={<ProtectedRoute roles={['student', 'admin']}><Navbar /><LearnPage /></ProtectedRoute>} />
          <Route path="/tutor" element={<ProtectedRoute roles={['tutor', 'admin']}><Navbar /><TutorDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Navbar /><AdminDashboard /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  )
}

export default App
