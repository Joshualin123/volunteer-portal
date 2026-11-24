import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react"
import { api } from "./api"
import type {
  ApiApplication,
  ApiNotification,
  ApiOrganization,
  ApiPosition,
} from "./api"

/**
 * PORTAL APPLICATION MAP
 * ----------------------
 * Search for the numbered "SECTION" comments to jump to a feature area:
 *  1. Data types and demo data
 *  2. Shared UI components
 *  3. App state, persistence, routing, and authorization
 *  4. Shared header/navigation
 *  5. Authentication and registration
 *  6. Volunteer screens
 *  7. Organization screens
 *  8. Admin screens
 *  9. Shared dialogs and feedback
 *
 * This prototype intentionally keeps its data and screens in one file so all
 * cross-role updates use the same Store. Screen-specific state is documented
 * beside the component that owns it.
 */

// ============================================================================
// SECTION 1: DATA TYPES AND DEMO DATA
// ============================================================================

// The three account types used for route protection and role-specific menus.
type Role = "volunteer" | "organization" | "admin"
type OrgStatus = "Approved" | "Pending" | "Rejected"
type PostStatus = "Active" | "Paused"
// Historical values remain in the type for persisted demo data. Organization
// screens intentionally expose only Pending and Accepted as active states.
type ApplicantStatus = "New" | "Under Review" | "Contacted" | "Accepted" | "Rejected"

type User = {
  id: string
  name: string
  email: string
  password: string
  role: Role
  orgId?: string
}
type Organization = {
  id: string
  name: string
  email: string
  description: string
  logoUrl?: string
  website?: string
  charitableRegistrationNumber?: string
  missionStatement?: string
  status: OrgStatus
  notify: boolean
}
type Position = {
  id: string
  title: string
  orgId: string
  location: string
  distance: number
  date: string
  time: string
  type: string
  commitment: string
  spots: number
  description: string
  responsibilities: string[]
  requirements: string[]
  status: PostStatus
  notify: boolean
  contactEmail?: string
  contactPhone?: string
}
type Application = {
  id: string
  positionId: string
  volunteerId: string
  name: string
  email: string
  phone: string
  skills: string
  availability: string
  resumeName: string
  resumeDataUrl: string
  resumeText: string
  message: string
  date: string
  status: ApplicantStatus
}
type NotificationRecord = {
  id: string
  orgId: string
  text: string
  date: string
  read: boolean
}
type Store = {
  // All prototype data lives here so edits are immediately visible to every role.
  users: User[]
  organizations: Organization[]
  positions: Position[]
  applications: Application[]
  favorites: Record<string, string[]>
  notifications: NotificationRecord[]
}
const SESSION_KEY = "volunteer-portal-session-v1"
const emptyStore = (): Store => ({
  users: [],
  organizations: [],
  positions: [],
  applications: [],
  favorites: {},
  notifications: [],
})
const currentSqlDate = () => new Date().toISOString().slice(0, 10)
const displayDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : currentSqlDate()
const uid = (_prefix: string) => crypto.randomUUID()
const fromApiOrganization = (organization: ApiOrganization): Organization => ({
  id: organization.oid,
  name: organization.oname,
  email: organization.email,
  description: organization.description,
  logoUrl: organization.logoUrl || organization.logo_url || undefined,
  website: organization.website || undefined,
  charitableRegistrationNumber:
    organization.charitableRegistrationNumber ||
    organization.charitable_registration_number ||
    undefined,
  missionStatement:
    organization.missionStatement ||
    organization.mission_statement ||
    undefined,
  status: organization.status,
  notify: organization.notify,
})
const fromApiPosition = (position: ApiPosition): Position => ({
  id: position.pid,
  title: position.title,
  orgId: position.oid,
  location: position.location,
  distance: Number(position.distance),
  date: displayDate(String(position.date).slice(0, 10)),
  time: position.time_range,
  type: "Community Support",
  commitment: position.commitment,
  spots: Number(position.spots),
  description: position.description,
  responsibilities: position.responsibilities || [],
  requirements: position.requirements || [],
  status: position.status,
  notify: position.notify,
  contactEmail: position.contact_email,
  contactPhone: position.contact_phone,
})
const toApiPosition = (position: Position): ApiPosition => ({
  pid: position.id,
  title: position.title,
  oid: position.orgId,
  location: position.location,
  distance: Math.round(position.distance),
  date: position.date,
  time_range: position.time.replace(" – ", " – "),
  commitment: position.commitment as ApiPosition["commitment"],
  spots: position.spots,
  description: position.description,
  responsibilities: position.responsibilities,
  requirements: position.requirements,
  status: position.status,
  notify: position.notify,
  contact_email: position.contactEmail || "",
  contact_phone: position.contactPhone || "",
})
const fromApiApplication = (application: ApiApplication): Application => ({
  id: application.aid,
  positionId: application.pid,
  volunteerId: application.volunteer_id,
  name: application.name,
  email: application.email,
  phone: application.phone || "",
  skills: application.skills || "",
  availability: application.availability || "",
  resumeName: application.resumeName || application.resume_name || "",
  resumeDataUrl: application.resumeDataUrl || application.resume_data_url || "",
  resumeText: application.resumeText || application.resume_text || "",
  message: application.message,
  date: displayDate(String(application.date).slice(0, 10)),
  status: application.status,
})
const toApiApplication = (application: Application): ApiApplication => ({
  aid: application.id,
  pid: application.positionId,
  volunteer_id: application.volunteerId,
  name: application.name,
  email: application.email,
  message: application.message,
  date: application.date,
  status: application.status,
  phone: application.phone,
  skills: application.skills,
  availability: application.availability,
  resumeName: application.resumeName,
  resumeDataUrl: application.resumeDataUrl,
  resumeText: application.resumeText,
})
const fromApiNotification = (
  notification: ApiNotification,
): NotificationRecord => ({
  id: notification.nid,
  orgId: notification.oid,
  text: notification.text,
  date: displayDate(String(notification.date).slice(0, 10)),
  read: notification.is_read,
})
const toApiNotification = (
  notification: NotificationRecord,
): ApiNotification => ({
  nid: notification.id,
  oid: notification.orgId,
  text: notification.text,
  date: notification.date,
  is_read: notification.read,
})

const fromApiUser = (user: {
  uid: string
  uname: string
  email: string
  role: Role
}): User => ({
  id: user.uid,
  name: user.uname,
  email: user.email,
  password: "",
  role: user.role,
  orgId: user.role === "organization" ? user.uid : undefined,
})

async function loadApiStore(currentUser?: User): Promise<Store> {
  if (!currentUser) return emptyStore()

  if (currentUser.role === "admin") {
    const [users, organizations, positions, applications] = await Promise.all([
      api.getUsers(),
      api.getOrganizations(),
      api.getAllPositions(),
      api.getAllApplications(),
    ])
    return {
      users: users.map(fromApiUser),
      organizations: organizations.map(fromApiOrganization),
      positions: positions.map(fromApiPosition),
      applications: applications.map(fromApiApplication),
      favorites: {},
      notifications: [],
    }
  }

  if (currentUser.role === "organization") {
    const organizationId = currentUser.orgId || currentUser.id
    const [organization, positions, applications, notifications] =
      await Promise.all([
        api.getOrganization(organizationId),
        api.getOrganizationPositions(organizationId),
        api.getOrganizationApplications(organizationId),
        api.getNotifications(organizationId),
      ])
    return {
      users: [currentUser],
      organizations: [fromApiOrganization(organization)],
      positions: positions.map(fromApiPosition),
      applications: applications.map(fromApiApplication),
      favorites: {},
      notifications: notifications.map(fromApiNotification),
    }
  }

  const [organizations, positions, applications, savedPositions] =
    await Promise.all([
      api.getOrganizations(),
      api.getPositions(),
      api.getUserApplications(currentUser.id),
      api.getSavedPositions(currentUser.id),
    ])
  return {
    users: [currentUser],
    organizations: organizations.map(fromApiOrganization),
    positions: positions.map(fromApiPosition),
    applications: applications.map(fromApiApplication),
    favorites: {
      [currentUser.id]: savedPositions.map((item) => item.pid),
    },
    notifications: [],
  }
}

// ============================================================================
// SECTION 2: SHARED UI COMPONENTS
// ============================================================================

// Central icon registry. Add a path here instead of scattering inline SVGs.
type IconProps = {
  name: string
  size?: number
}

function Icon({ name, size = 20 }: IconProps) {
  const paths: Record<string, ReactNode> = {
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M14 3h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6" />
      </>
    ),
    reset: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  }
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function Button({
  children,
  variant = "primary",
  icon,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  icon?: string
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}
function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode
  error?: string
}) {
  const { className, ...inputProps } = props
  return (
    <label className={`field ${className || ""}`}>
      <span>{label}</span>
      <input {...inputProps} />
      {error && <small className="field-error">{error}</small>}
    </label>
  )
}
function SelectField({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>{children}</select>
    </label>
  )
}
function TextArea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode }) {
  const { className, ...textareaProps } = props
  return (
    <label className={`field ${className || ""}`}>
      <span>{label}</span>
      <textarea {...textareaProps} />
    </label>
  )
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: string
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <>
      {children} <span className="required">*</span>
    </>
  )
}

// ============================================================================
// SECTION 3: APP STATE, PERSISTENCE, ROUTING, AND AUTHORIZATION
// ============================================================================

function App() {
  // API responses are authoritative; this store is only the current render cache.
  const [store, setStore] = useState<Store>(emptyStore)
  const [loading, setLoading] = useState(true)
  // The signed-in user's ID is session-only; closing the browser ends the session.
  const [userId, setUserId] = useState(
    () => sessionStorage.getItem(SESSION_KEY) || "",
  )
  // Hash routes keep browser back/forward functional without adding a router package.
  const [route, setRoute] = useState(
    () => location.hash.slice(1) || (userId ? "dashboard" : "login"),
  )
  // Global transient UI state shared by every screen.
  const [toast, setToast] = useState("")
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const user = store.users.find((item) => item.id === userId)

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      setLoading(true)
      try {
        const currentUser = userId
          ? fromApiUser(await api.getUser(userId))
          : undefined
        const nextStore = await loadApiStore(currentUser)
        if (!cancelled) setStore(nextStore)
      } catch (error) {
        if (!cancelled) {
          setStore(emptyStore())
          setToast(
            error instanceof Error
              ? error.message
              : "Unable to load portal data.",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [userId])
  useEffect(() => {
    const onHash = () =>
      setRoute(location.hash.slice(1) || (userId ? "dashboard" : "login"))
    addEventListener("hashchange", onHash)
    return () => removeEventListener("hashchange", onHash)
  }, [userId])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(""), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const go = (next: string) => {
    location.hash = next
  }
  const login = (id: string) => {
    sessionStorage.setItem(SESSION_KEY, id)
    setUserId(id)
    go("dashboard")
  }
  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setUserId("")
    setProfileOpen(false)
    go("login")
  }
  const reset = async () => {
    if (
      !confirm(
        "Reset all accounts, applications, favorites, and postings to the original demo data?",
      )
    )
      return
    try {
      await api.resetDemoData()
      setStore(await loadApiStore())
      setToast("Demo data has been reset.")
      logout()
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Reset failed.")
    }
  }
  const updateStore = (fn: (previous: Store) => Store) => setStore(fn)

  if (loading) return <div className="center-state">Loading portal data…</div>

  if (!user) {
    return (
      <>
        <PublicHeader go={go} />
        <main>
          {route === "register" ? (
            <Register
              store={store}
              updateStore={updateStore}
              login={login}
              go={go}
            />
          ) : route === "pending" ? (
            <PendingMessage go={go} />
          ) : (
            <Login login={login} go={go} />
          )}
        </main>
        <Toast message={toast} />
      </>
    )
  }

  // This allow-list prevents users from opening another role's hash route manually.
  const role = user.role
  const roleAllowed =
    route === "dashboard" ||
    route === "notifications" ||
    (role === "volunteer" &&
      ["browse", "saved", "applied"].some(
        (r) => route === r || route.startsWith("opportunity/"),
      )) ||
    (role === "organization" &&
      ["new-position", "all-applicants"].some((r) => route === r)) ||
    (role === "organization" &&
      (route.startsWith("edit/") || route.startsWith("applicants/"))) ||
    (role === "admin" && ["admin", "pending-requests"].includes(route))
  if (!roleAllowed) setTimeout(() => go("dashboard"), 0)

  // Route-to-screen mapping. Add new authenticated pages in this switch-like block.
  let screen: ReactNode
  if (route === "dashboard") {
    screen =
      role === "volunteer" ? (
        <VolunteerDashboard
          store={store}
          user={user}
          updateStore={updateStore}
          go={go}
          toast={setToast}
        />
      ) : role === "organization" ? (
        <OrganizationDashboard
          store={store}
          user={user}
          updateStore={updateStore}
          go={go}
          toast={setToast}
        />
      ) : (
        <AdminDashboard
          store={store}
          updateStore={updateStore}
          go={go}
          toast={setToast}
        />
      )
  } else if (route === "browse") {
    screen = (
      <Browse
        store={store}
        user={user}
        updateStore={updateStore}
        go={go}
        toast={setToast}
      />
    )
  } else if (route === "saved") {
    screen = (
      <Saved
        store={store}
        user={user}
        updateStore={updateStore}
        go={go}
        toast={setToast}
      />
    )
  } else if (route === "applied") {
    screen = <AppliedOpportunities store={store} user={user} go={go} />
  } else if (route.startsWith("opportunity/")) {
    screen = (
      <OpportunityDetails
        id={route.split("/")[1]}
        store={store}
        user={user}
        updateStore={updateStore}
        go={go}
        toast={setToast}
      />
    )
  } else if (route === "new-position" || route.startsWith("edit/")) {
    screen = (
      <PositionForm
        id={route.split("/")[1]}
        store={store}
        user={user}
        updateStore={updateStore}
        go={go}
        toast={setToast}
      />
    )
  } else if (route.startsWith("applicants/")) {
    screen = (
      <Applicants
        id={route.split("/")[1]}
        store={store}
        updateStore={updateStore}
        go={go}
        toast={setToast}
      />
    )
  } else if (route === "all-applicants") {
    screen = (
      <OrganizationAllApplicants
        store={store}
        user={user}
        updateStore={updateStore}
        go={go}
        toast={setToast}
      />
    )
  } else if (route === "pending-requests") {
    screen = (
      <PendingRequests
        store={store}
        updateStore={updateStore}
        go={go}
        toast={setToast}
      />
    )
  } else if (route === "notifications") {
    screen = (
      <Notifications store={store} user={user} updateStore={updateStore} />
    )
  } else {
    screen =
      role === "admin" ? (
        <AdminDashboard
          store={store}
          updateStore={updateStore}
          go={go}
          toast={setToast}
        />
      ) : null
  }

  return (
    <div className="app-shell">
      <Header
        user={user}
        store={store}
        go={go}
        logout={logout}
        reset={reset}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        notificationsOpen={notificationsOpen}
        setNotificationsOpen={setNotificationsOpen}
      />
      <main>{screen}</main>
      <footer>
        <span>
          Portal · CIS 3750 Prototype · United Way Guelph Wellington Dufferin
        </span>
        <div
          className="footer-hashtags"
          aria-label="United Way campaign hashtags"
        >
          <span>#BetterIsPossible</span>
          <span>#UnitedForGood</span>
          <span>#LocalLove</span>
        </div>
        <button onClick={reset}>
          <Icon name="reset" size={15} /> Reset demo data
        </button>
      </footer>
      <Toast message={toast} />
    </div>
  )
}

// ============================================================================
// SECTION 4: SHARED HEADER AND ROLE-BASED NAVIGATION
// ============================================================================

function PublicHeader({ go }: { go: (route: string) => void }) {
  return (
    <header className="public-header">
      <button className="brand" onClick={() => go("login")}>
        <img
          className="brand-logo"
          src="/assets/united-way-horizontal.png"
          alt="United Way Guelph Wellington Dufferin — United for Good"
        />
        <span className="portal-name">Portal</span>
      </button>
      <span className="public-note">#UnitedForGood</span>
    </header>
  )
}

function Header({
  user,
  store,
  go,
  logout,
  reset,
  profileOpen,
  setProfileOpen,
  notificationsOpen,
  setNotificationsOpen,
}: {
  user: User
  store: Store
  go: (route: string) => void
  logout: () => void
  reset: () => void
  profileOpen: boolean
  setProfileOpen: (value: boolean) => void
  notificationsOpen: boolean
  setNotificationsOpen: (value: boolean) => void
}) {
  const orgNotifications = user.orgId
    ? store.notifications.filter(
        (notification) => notification.orgId === user.orgId,
      )
    : []
  const unread = orgNotifications.filter(
    (notification) => !notification.read,
  ).length
  // Each role gets only the destinations it is authorized to open.
  const nav =
    user.role === "volunteer"
      ? [
          ["dashboard", "Dashboard"],
          ["browse", "Browse Opportunities"],
          ["saved", "Saved Opportunities"],
          ["applied", "Applied Opportunities"],
        ]
      : user.role === "organization"
        ? [
            ["dashboard", "My Posts"],
            ["new-position", "Create Position"],
            ["all-applicants", "Applicants"],
          ]
        : [
            ["dashboard", "Admin Dashboard"],
            ["pending-requests", "Pending Requests"],
          ]
  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="brand" onClick={() => go("dashboard")}>
          <img
            className="brand-logo"
            src="/assets/united-way-horizontal.png"
            alt="United Way Guelph Wellington Dufferin"
          />
          <span className="portal-name">Portal</span>
        </button>
        <nav>
          {nav.map(([key, label]) => (
            <button
              key={key}
              onClick={() => go(key)}
              className={
                location.hash.includes(key) ||
                (key === "dashboard" && location.hash === "#dashboard")
                  ? "active"
                  : ""
              }
            >
              {label}
              {key === "pending-requests" && (
                <span className="nav-count">
                  {
                    store.organizations.filter((o) => o.status === "Pending")
                      .length
                  }
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          {user.role === "organization" && (
            <div className="popover-wrap">
              <button
                className="icon-btn"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <Icon name="bell" />
                {unread > 0 && (
                  <span className="notification-dot">{unread}</span>
                )}
              </button>
              {notificationsOpen && (
                <div className="popover notification-pop">
                  <div className="popover-title">Notifications</div>
                  {orgNotifications.length ? (
                    orgNotifications.slice(0, 4).map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => {
                          go("notifications")
                          setNotificationsOpen(false)
                        }}
                      >
                        {notification.text}
                        <small>{displayDate(notification.date)}</small>
                      </button>
                    ))
                  ) : (
                    <p>No notifications yet.</p>
                  )}
                  <button
                    className="popover-link"
                    onClick={() => go("notifications")}
                  >
                    View all notifications
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="popover-wrap">
            <button
              className="profile-button"
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <span className="avatar">
                {user.name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>
                  {user.role === "admin" ? "United Way Admin" : user.role}
                </small>
              </span>
            </button>
            {profileOpen && (
              <div className="popover profile-pop">
                <div>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </div>
                <button onClick={reset}>
                  <Icon name="reset" size={17} /> Reset demo data
                </button>
                <button onClick={logout}>
                  <Icon name="logout" size={17} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

// ============================================================================
// SECTION 5: AUTHENTICATION, REGISTRATION, AND APPROVAL-PENDING STATE
// ============================================================================

function Login({
  login,
  go,
}: {
  login: (id: string) => void
  go: (route: string) => void
}) {
  const [role, setRole] = useState<Role>("volunteer")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    let found: User
    try {
      found = fromApiUser(await api.login(email.trim(), password))
    } catch {
      return setError("We couldn’t find an account with those credentials.")
    }
    if (
      found.name.toLowerCase() !==
      `${firstName.trim()} ${lastName.trim()}`.toLowerCase()
    )
      return setError("The first and last name do not match this account.")
    if (found.role !== role)
      return setError(
        `This account is registered as ${found.role}. Select the matching role to continue.`,
      )
    if (found.role === "organization") {
      const org = await api.getOrganization(found.orgId || found.id)
      if (org.status !== "Approved")
        return setError(
          org.status === "Rejected"
            ? "This organization request was not approved."
            : "This organization account is awaiting administrator approval.",
        )
    }
    login(found.id)
  }
  const fillDemo = (nextRole: Role) => {
    setRole(nextRole)
    const demoName =
      nextRole === "volunteer"
        ? ["Jamie", "Morgan"]
        : nextRole === "organization"
          ? ["Morgan", "Lee"]
          : ["Taylor", "Admin"]
    setFirstName(demoName[0])
    setLastName(demoName[1])
    setEmail(
      nextRole === "volunteer"
        ? "volunteer@demo.com"
        : nextRole === "organization"
          ? "organization@demo.com"
          : "admin@demo.com",
    )
    setPassword("demo123")
    setError("")
  }
  return (
    <div className="auth-page">
      <section className="auth-intro">
        <img
          className="auth-logo"
          src="/assets/united-way-vertical-dark.png"
          alt="United Way Guelph Wellington Dufferin — United for Good"
        />
        <Badge tone="green">#BetterIsPossible</Badge>
        <h1>Welcome back</h1>
        <p>
          Find meaningful ways to help, connect with volunteers, and strengthen
          your community.
        </p>
        <div className="auth-hashtags">
          <span>#UnitedForGood</span>
          <span>#LocalLove</span>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-heading">
          <span className="eyebrow">Sign in to continue</span>
          <h2>Log in to your account</h2>
          <p>Choose your account type, then enter your details.</p>
        </div>
        <div className="auth-create-account">
          <span>New to Portal?</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => go("register")}
          >
            Create a new account
          </Button>
        </div>
        <form onSubmit={submit}>
          <div className="role-picker">
            {(["volunteer", "organization", "admin"] as Role[]).map((item) => (
              <button
                type="button"
                key={item}
                className={role === item ? "selected" : ""}
                onClick={() => {
                  setRole(item)
                  setError("")
                }}
              >
                <Icon
                  name={
                    item === "volunteer"
                      ? "heart"
                      : item === "organization"
                        ? "user"
                        : "check"
                  }
                />
                <span>{item === "admin" ? "United Way Admin" : item}</span>
              </button>
            ))}
          </div>
          <div className="name-row">
            <Field
              label={<RequiredLabel>First name</RequiredLabel>}
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Field
              label={<RequiredLabel>Last name</RequiredLabel>}
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <Field
            label={<RequiredLabel>Email address</RequiredLabel>}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="field">
            <span>
              <RequiredLabel>Password</RequiredLabel>
            </span>
            <span className="password-field">
              <input
                type={show ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label="Show or hide password"
              >
                <Icon name="eye" />
              </button>
            </span>
          </label>
          {error && <div className="form-alert">{error}</div>}
          <Button type="submit" className="full">
            Log in <Icon name="arrow" size={18} />
          </Button>
        </form>
        <div className="demo-box">
          <div>
            <strong>Try a demo account</strong>
            <span>
              Password for all accounts: <code>demo123</code>
            </span>
          </div>
          <div>
            {(["volunteer", "organization", "admin"] as Role[]).map((item) => (
              <button key={item} onClick={() => fillDemo(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function Register({
  store,
  updateStore,
  login,
  go,
}: {
  store: Store
  updateStore: (fn: (s: Store) => Store) => void
  login: (id: string) => void
  go: (route: string) => void
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    organizationName: "",
    organizationLogoUrl: "",
    organizationWebsite: "",
    charitableRegistrationNumber: "",
    missionStatement: "",
    email: "",
    password: "",
    confirm: "",
    role: "" as Role | "",
    description: "",
  })
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({
    firstName: "",
    lastName: "",
    organizationName: "",
    organizationLogoUrl: "",
    organizationWebsite: "",
    email: "",
    password: "",
    confirm: "",
  })
  const isValidHttpUrl = (value: string) => {
    try {
      const url = new URL(value)
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        Boolean(url.hostname)
      )
    } catch {
      return false
    }
  }
  const change = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setError("")
    if (key === "firstName") {
      setFieldErrors((current) => ({
        ...current,
        firstName:
          (hasSubmitted || current.firstName) && !value.trim()
            ? "First name is required."
            : "",
      }))
    }
    if (key === "lastName") {
      setFieldErrors((current) => ({
        ...current,
        lastName:
          (hasSubmitted || current.lastName) && !value.trim()
            ? "Last name is required."
            : "",
      }))
    }
    if (key === "organizationName") {
      setFieldErrors((current) => ({
        ...current,
        organizationName:
          (hasSubmitted || current.organizationName) && !value.trim()
            ? "Organization name is required."
            : "",
      }))
    }
    if (key === "organizationWebsite") {
      setFieldErrors((current) => ({
        ...current,
        organizationWebsite:
          (hasSubmitted || current.organizationWebsite) &&
          value.trim() &&
          !isValidHttpUrl(value.trim())
            ? "Please enter a valid website URL."
            : "",
      }))
    }
    if (key === "organizationLogoUrl") {
      setFieldErrors((current) => ({
        ...current,
        organizationLogoUrl:
          (hasSubmitted || current.organizationLogoUrl) &&
          value.trim() &&
          !isValidHttpUrl(value.trim())
            ? "Please enter a valid image URL."
            : "",
      }))
    }
    if (key === "email") {
      setFieldErrors((current) => ({
        ...current,
        email:
          hasSubmitted || current.email
            ? !value.trim()
              ? "Email address is required."
              : !/^\S+@\S+\.\S+$/.test(value.trim())
                ? "Please enter a valid email address."
                : store.users.some(
                      (user) =>
                        user.email.toLowerCase() === value.trim().toLowerCase(),
                    )
                  ? "An account with this email already exists."
                  : ""
            : "",
      }))
    }
    if (key === "password") {
      setFieldErrors((current) => ({
        ...current,
        password:
          hasSubmitted || current.password
            ? !value
              ? "Password is required."
              : value.length < 6
                ? "Password must be at least 6 characters."
                : ""
            : "",
        confirm:
          hasSubmitted || current.confirm
            ? !form.confirm
              ? "Please confirm your password."
              : value !== form.confirm
                ? "Passwords do not match."
                : ""
            : "",
      }))
    }
    if (key === "confirm") {
      setFieldErrors((current) => ({
        ...current,
        confirm:
          hasSubmitted || current.confirm
            ? !value
              ? "Please confirm your password."
              : value !== form.password
                ? "Passwords do not match."
                : ""
            : "",
      }))
    }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setHasSubmitted(true)
    const firstNameError = !form.firstName.trim()
      ? "First name is required."
      : ""
    const lastNameError = !form.lastName.trim() ? "Last name is required." : ""
    const emailIsDuplicate = store.users.some(
      (user) => user.email.toLowerCase() === form.email.trim().toLowerCase(),
    )
    const emailError = !form.email.trim()
      ? "Email address is required."
      : !/^\S+@\S+\.\S+$/.test(form.email.trim())
        ? "Please enter a valid email address."
        : emailIsDuplicate
          ? "An account with this email already exists."
          : ""
    const passwordError = !form.password
      ? "Password is required."
      : form.password.length < 6
        ? "Password must be at least 6 characters."
        : ""
    const confirmError = !form.confirm
      ? "Please confirm your password."
      : form.password !== form.confirm
        ? "Passwords do not match."
        : ""
    const organizationNameError =
      form.role === "organization" && !form.organizationName.trim()
        ? "Organization name is required."
        : ""
    const organizationWebsiteError =
      form.role === "organization" &&
      form.organizationWebsite.trim() &&
      !isValidHttpUrl(form.organizationWebsite.trim())
        ? "Please enter a valid website URL."
        : ""
    const organizationLogoUrlError =
      form.role === "organization" &&
      form.organizationLogoUrl.trim() &&
      !isValidHttpUrl(form.organizationLogoUrl.trim())
        ? "Please enter a valid image URL."
        : ""
    setFieldErrors({
      firstName: firstNameError,
      lastName: lastNameError,
      organizationName: organizationNameError,
      organizationLogoUrl: organizationLogoUrlError,
      organizationWebsite: organizationWebsiteError,
      email: emailError,
      password: passwordError,
      confirm: confirmError,
    })
    const hasOtherMissingFields = !form.role
    if (hasOtherMissingFields)
      setError("Complete all required fields and select an account type.")
    else setError("")
    if (
      firstNameError ||
      lastNameError ||
      emailError ||
      passwordError ||
      confirmError ||
      organizationNameError ||
      organizationLogoUrlError ||
      organizationWebsiteError ||
      hasOtherMissingFields
    )
      return
    const selectedRole = form.role as Role
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`
    let remoteUser
    try {
      remoteUser = await api.createUser({
        uname: fullName,
        email: form.email.trim(),
        password: form.password,
        role: selectedRole,
      })
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Unable to create account."
      if (/email|duplicate|unique|already exists/i.test(message)) {
        setFieldErrors((current) => ({
          ...current,
          email: "An account with this email already exists.",
        }))
      }
      setError(
        /email|duplicate|unique|already exists/i.test(message) ? "" : message,
      )
      return
    }
    const user = fromApiUser(remoteUser)
    const organization: Organization | undefined =
      selectedRole === "organization"
        ? {
            id: user.orgId!,
            name: form.organizationName.trim(),
            email: form.email.trim(),
            logoUrl: form.organizationLogoUrl.trim() || undefined,
            website: form.organizationWebsite.trim() || undefined,
            charitableRegistrationNumber:
              form.charitableRegistrationNumber.trim() || undefined,
            missionStatement: form.missionStatement.trim() || undefined,
            description: form.description.trim(),
            status: "Pending",
            notify: false,
          }
        : undefined
    let savedOrganization = organization
    if (organization) {
      try {
        savedOrganization = fromApiOrganization(
          await api.createOrganization({
            oid: organization.id,
            oname: organization.name,
            email: organization.email,
            description: organization.description,
            logoUrl: organization.logoUrl,
            website: organization.website,
            charitableRegistrationNumber:
              organization.charitableRegistrationNumber,
            missionStatement: organization.missionStatement,
            status: organization.status,
            notify: organization.notify,
          }),
        )
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Unable to create organization.",
        )
        return
      }
    }
    updateStore((s) => ({
      ...s,
      users: [...s.users, user],
      organizations: savedOrganization
        ? [...s.organizations, savedOrganization]
        : s.organizations,
    }))
    if (selectedRole === "organization") go("pending")
    else login(user.id)
  }
  return (
    <div className="form-page auth-form-page">
      <section className="form-card register-card">
        <button className="back-link" onClick={() => go("login")}>
          <Icon name="back" size={17} /> Back to login
        </button>
        <div className="auth-heading">
          <span className="eyebrow">Join the community</span>
          <h1>Create your account</h1>
          <p>Start making a difference in just a few steps.</p>
        </div>
        <form onSubmit={submit} className="form-grid" noValidate>
          <Field
            label={<RequiredLabel>First name</RequiredLabel>}
            placeholder="Enter your first name"
            value={form.firstName}
            error={fieldErrors.firstName}
            required
            onChange={(e) => change("firstName", e.target.value)}
          />
          <Field
            label={<RequiredLabel>Last name</RequiredLabel>}
            placeholder="Enter your last name"
            value={form.lastName}
            error={fieldErrors.lastName}
            required
            onChange={(e) => change("lastName", e.target.value)}
          />
          <Field
            label={<RequiredLabel>Email address</RequiredLabel>}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            error={fieldErrors.email}
            required
            onChange={(e) => change("email", e.target.value)}
          />
          <div className="password-guidance-field">
            <label className="field">
              <span>
                <RequiredLabel>Password</RequiredLabel>
              </span>
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={form.password}
                  required
                  onChange={(e) => change("password", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name="eye" />
                </button>
              </span>
              {fieldErrors.password && (
                <small className="field-error">{fieldErrors.password}</small>
              )}
            </label>
            <small>Use at least 6 characters.</small>
          </div>
          <label className="field">
            <span>
              <RequiredLabel>Confirm password</RequiredLabel>
            </span>
            <span className="password-field">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repeat your password"
                value={form.confirm}
                required
                onChange={(e) => change("confirm", e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                aria-label={
                  showConfirmPassword
                    ? "Hide confirmation password"
                    : "Show confirmation password"
                }
              >
                <Icon name="eye" />
              </button>
            </span>
            {fieldErrors.confirm && (
              <small className="field-error">{fieldErrors.confirm}</small>
            )}
          </label>
          {form.role === "organization" && (
            <>
              <Field
                label={<RequiredLabel>Organization name</RequiredLabel>}
                className="form-wide"
                placeholder="Enter the registered organization name"
                value={form.organizationName}
                error={fieldErrors.organizationName}
                required
                onChange={(e) => change("organizationName", e.target.value)}
              />
              <Field
                label="Organization logo or profile picture URL"
                type="url"
                className="form-wide"
                placeholder="https://www.example.org/logo.png"
                value={form.organizationLogoUrl}
                error={fieldErrors.organizationLogoUrl}
                onChange={(e) => change("organizationLogoUrl", e.target.value)}
              />
              <Field
                label="Organization website"
                type="url"
                placeholder="https://www.example.org"
                value={form.organizationWebsite}
                error={fieldErrors.organizationWebsite}
                onChange={(e) => change("organizationWebsite", e.target.value)}
              />
              <Field
                label="Charitable registration number"
                placeholder="Enter registration number"
                value={form.charitableRegistrationNumber}
                onChange={(e) =>
                  change("charitableRegistrationNumber", e.target.value)
                }
              />
              <TextArea
                label="Mission statement"
                className="form-wide"
                placeholder="Describe your organization's purpose and mission"
                rows={4}
                value={form.missionStatement}
                onChange={(e) => change("missionStatement", e.target.value)}
              />
              <TextArea
                label="Additional organization details"
                className="form-wide"
                placeholder="Provide any further information for administrator review"
                rows={4}
                value={form.description}
                onChange={(e) => change("description", e.target.value)}
              />
            </>
          )}
          {error && <div className="form-alert form-wide">{error}</div>}
          <div className="field form-wide">
            <span>
              <RequiredLabel>I want to join as</RequiredLabel>
            </span>
            <div className="account-types">
              <button
                type="button"
                className={form.role === "volunteer" ? "selected" : ""}
                onClick={() => change("role", "volunteer")}
              >
                <Icon name="heart" />
                <span>
                  <strong>Volunteer</strong>
                  <small>Discover and apply for opportunities</small>
                </span>
              </button>
              <button
                type="button"
                className={form.role === "organization" ? "selected" : ""}
                onClick={() => change("role", "organization")}
              >
                <Icon name="user" />
                <span>
                  <strong>Organization</strong>
                  <small>Post roles and manage applicants</small>
                </span>
              </button>
            </div>
          </div>
          <Button className="form-wide" type="submit">
            Create account
          </Button>
        </form>
        <p className="auth-switch">
          Already have an account?{" "}
          <button onClick={() => go("login")}>Log in</button>
        </p>
      </section>
    </div>
  )
}

function PendingMessage({ go }: { go: (route: string) => void }) {
  return (
    <div className="center-state">
      <span className="state-icon">
        <Icon name="check" size={32} />
      </span>
      <Badge tone="amber">Approval pending</Badge>
      <h1>Your request is with our team</h1>
      <p>
        An administrator needs to approve your organization before you can
        create and manage volunteer positions. Use the Admin demo account to
        review this request.
      </p>
      <Button onClick={() => go("login")}>Return to login</Button>
    </div>
  )
}

function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

// ============================================================================
// SECTION 6: VOLUNTEER SCREENS
// Dashboard, browse/filter, cards, saved, applied, and opportunity details.
// ============================================================================

function VolunteerDashboard({
  store,
  user,
  updateStore,
  go,
  toast,
}: {
  store: Store
  user: User
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  const active = store.positions.filter((p) => p.status === "Active")
  const saved = store.favorites[user.id] || []
  const toggleSave = async (id: string) => {
    const isSaved = saved.includes(id)
    try {
      if (isSaved) await api.unsavePosition(user.id, id)
      else await api.savePosition(user.id, id)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to update saved opportunities.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      favorites: {
        ...s.favorites,
        [user.id]: isSaved ? saved.filter((x) => x !== id) : [...saved, id],
      },
    }))
    toast(
      isSaved
        ? "Removed from Saved Opportunities."
        : "Added to Saved Opportunities.",
    )
  }
  return (
    <div className="page">
      <section className="hero-panel">
        <div>
          <span className="eyebrow light">Volunteer dashboard</span>
          <h1>Good to see you, {user.name.split(" ")[0]}.</h1>
          <p>Your next chance to make a difference is closer than you think.</p>
          <Button variant="secondary" onClick={() => go("browse")}>
            Browse all opportunities <Icon name="arrow" />
          </Button>
        </div>
        <div className="impact-stat">
          <span>{active.length}</span>
          <small>active opportunities</small>
        </div>
      </section>
      <section className="community-story">
        <img
          src="/assets/volunteer-teamwork.webp"
          alt="Volunteers working together to prepare community food packages"
        />
        <div>
          <span className="eyebrow">#LocalLove in action</span>
          <h2>When we work together, local change adds up.</h2>
          <p>
            Discover organizations across Guelph, Wellington and Dufferin that
            are looking for people like you.
          </p>
          <Button variant="ghost" onClick={() => go("browse")}>
            Find your way to help <Icon name="arrow" />
          </Button>
        </div>
      </section>
      <section className="quick-grid quick-grid-two">
        <button onClick={() => go("browse")}>
          <span>
            <Icon name="search" />
          </span>
          <strong>Explore opportunities</strong>
          <small>Search by cause, location, or time</small>
        </button>
        <button onClick={() => go("saved")}>
          <span>
            <Icon name="heart" />
          </span>
          <strong>
            {saved.length} saved{" "}
            {saved.length === 1 ? "opportunity" : "opportunities"}
          </strong>
          <small>Pick up where you left off</small>
        </button>
      </section>
      <div className="section-title">
        <div>
          <h2>Recommended for you</h2>
          <p>Active opportunities that match a variety of interests.</p>
        </div>
        <button onClick={() => go("browse")}>
          View all <Icon name="arrow" size={16} />
        </button>
      </div>
      <div className="card-grid">
        {active.slice(0, 3).map((p) => (
          <OpportunityCard
            key={p.id}
            position={p}
            store={store}
            saved={saved.includes(p.id)}
            onSave={() => toggleSave(p.id)}
            go={go}
            compact
          />
        ))}
      </div>
      <section className="recent-panel">
        <div>
          <Icon name="search" />
        </div>
        <span>
          <strong>Recent search</strong>
          <small>Environment · Within 10 km</small>
        </span>
        <Button variant="ghost" onClick={() => go("browse")}>
          Search again
        </Button>
      </section>
    </div>
  )
}

function Browse({
  store,
  user,
  updateStore,
  go,
  toast,
}: {
  store: Store
  user: User
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  // Opportunity filters. These update results immediately—there is no Apply button.
  const [distance, setDistance] = useState(25)
  const [types, setTypes] = useState<string[]>([])
  const [commitments, setCommitments] = useState<string[]>([])
  const [applicationFilter, setApplicationFilter] =
    useState<"all" | "applied" | "not-applied">("all")
  // `originInput` is the draft modal value; `origin` is the submitted location.
  const [origin, setOrigin] = useState("50 Stone Road E, Guelph, ON")
  const [originInput, setOriginInput] = useState(origin)
  const [originError, setOriginError] = useState("")
  const [originOpen, setOriginOpen] = useState(false)
  // Prototype-only generated distances keyed by position ID.
  const [calculatedDistances, setCalculatedDistances] =
    useState<Record<string, number>>({})
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("distance")
  const saved = store.favorites[user.id] || []
  const appliedPositionIds = store.applications
    .filter((application) => application.volunteerId === user.id)
    .map((application) => application.positionId)
  const calculatedDistance = (position: Position) =>
    calculatedDistances[position.id] ?? position.distance
  // All browse controls are composed here so search, filters, and sorting work together.
  const results = useMemo(
    () =>
      store.positions
        .filter((p) => p.status === "Active")
        .filter((p) => calculatedDistance(p) <= distance)
        .filter((p) => !types.length || types.includes(p.type))
        .filter(
          (p) => !commitments.length || commitments.includes(p.commitment),
        )
        .filter(
          (p) =>
            applicationFilter === "all" ||
            (applicationFilter === "applied"
              ? appliedPositionIds.includes(p.id)
              : !appliedPositionIds.includes(p.id)),
        )
        .filter((p) =>
          `${p.title} ${p.location} ${store.organizations.find((o) => o.id === p.orgId)?.name}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "distance"
            ? calculatedDistance(a) - calculatedDistance(b)
            : sort === "date"
              ? a.date.localeCompare(b.date)
              : a.title.localeCompare(b.title),
        ),
    [
      store,
      distance,
      types,
      commitments,
      applicationFilter,
      search,
      sort,
      calculatedDistances,
    ],
  )
  const toggle = (
    list: string[],
    value: string,
    setter: (next: string[]) => void,
  ) =>
    setter(
      list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
    )
  // Submitting the address intentionally generates simulated distances for this prototype.
  const applyOrigin = (event: FormEvent) => {
    event.preventDefault()
    const nextOrigin = originInput.trim()
    if (nextOrigin.length < 5)
      return setOriginError("Enter a complete address or postal code.")
    const nextDistances = Object.fromEntries(
      store.positions.map((position) => [
        position.id,
        Number((Math.random() * 30 + 0.5).toFixed(1)),
      ]),
    )
    setCalculatedDistances(nextDistances)
    setOrigin(nextOrigin)
    setOriginError("")
    setOriginOpen(false)
    toast(`Distances recalculated from ${nextOrigin}.`)
  }
  const save = async (id: string) => {
    const isSaved = saved.includes(id)
    try {
      if (isSaved) await api.unsavePosition(user.id, id)
      else await api.savePosition(user.id, id)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to update saved opportunities.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      favorites: {
        ...s.favorites,
        [user.id]: isSaved ? saved.filter((x) => x !== id) : [...saved, id],
      },
    }))
    toast(
      isSaved
        ? "Removed from Saved Opportunities."
        : "Added to Saved Opportunities.",
    )
  }
  return (
    <div className="page">
      <button className="back-link" onClick={() => go("dashboard")}>
        <Icon name="back" size={17} /> Back to Volunteer Home
      </button>
      <PageHead
        eyebrow="Discover your next opportunity"
        title="Browse opportunities"
        description="Find a cause that matters to you and make an impact close to home."
      />
      <div className="browse-layout">
        <aside className="filters">
          <div className="filter-head">
            <h2>Filters</h2>
            <button
              onClick={() => {
                setDistance(25)
                setTypes([])
                setCommitments([])
                setApplicationFilter("all")
              }}
            >
              Clear all
            </button>
          </div>
          <fieldset className="slider-filter">
            <legend>Distance radius</legend>
            <div>
              <strong>{distance} km</strong>
              <span>1–50 km</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
              aria-label="Maximum distance in kilometres"
            />
          </fieldset>
          <div className="location-filter">
            <span>
              <Icon name="pin" size={17} /> Distance from
            </span>
            <strong>{origin}</strong>
            <small>
              {Object.keys(calculatedDistances).length
                ? "Prototype distances calculated"
                : "Using default prototype distances"}
            </small>
            <Button
              variant="secondary"
              className="full"
              onClick={() => {
                setOriginInput(origin)
                setOriginError("")
                setOriginOpen(true)
              }}
            >
              Change address
            </Button>
          </div>
          <fieldset>
            <legend>Application status</legend>
            {([
              ["all", "All Opportunities"],
              ["applied", "Applied"],
              ["not-applied", "Not Applied"],
            ] as const).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="application-filter"
                  checked={applicationFilter === value}
                  onChange={() => setApplicationFilter(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Opportunity type</legend>
            {[
              "Environment",
              "Community Support",
              "Education",
              "Health & Wellness",
              "Animals",
              "Arts & Culture",
              "Other",
            ].map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={types.includes(v)}
                  onChange={() => toggle(types, v, setTypes)}
                />
                <span>{v}</span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Time commitment</legend>
            {["One-time", "Weekly", "Flexible"].map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={commitments.includes(v)}
                  onChange={() => toggle(commitments, v, setCommitments)}
                />
                <span>{v}</span>
              </label>
            ))}
          </fieldset>
        </aside>
        <section className="results">
          <div className="result-controls">
            <label className="search-box">
              <Icon name="search" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, organization, or location"
              />
            </label>
            <select
              aria-label="Sort opportunities"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="distance">Nearest first</option>
              <option value="date">Soonest date</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
          <div className="result-count">
            <strong>{results.length} opportunities</strong>
            <span>
              within {distance} km of {origin}
            </span>
          </div>
          <div className="opportunity-list">
            {results.length ? (
              results.map((p) => (
                <OpportunityCard
                  key={p.id}
                  position={p}
                  store={store}
                  saved={saved.includes(p.id)}
                  onSave={() => save(p.id)}
                  go={go}
                  calculatedDistance={calculatedDistance(p)}
                />
              ))
            ) : (
              <EmptyState
                title="No opportunities match"
                text="Try changing the address or clearing a few filters."
              />
            )}
          </div>
        </section>
      </div>
      {originOpen && (
        <Modal
          title="Calculate distance from an address"
          onClose={() => setOriginOpen(false)}
        >
          <form className="address-modal-form" onSubmit={applyOrigin}>
            <p>
              Enter your starting address. Since this is a prototype, the
              resulting opportunity distances are simulated.
            </p>
            <Field
              label="Address or postal code"
              id="filter-origin"
              value={originInput}
              onChange={(e) => setOriginInput(e.target.value)}
              placeholder="e.g. 123 Gordon Street, Guelph, ON"
              autoFocus
              error={originError}
            />
            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOriginOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Calculate distances</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function OpportunityCard({
  position,
  store,
  saved,
  onSave,
  go,
  compact = false,
  calculatedDistance,
}: {
  position: Position
  store: Store
  saved: boolean
  onSave: () => void
  go: (r: string) => void
  compact?: boolean
  calculatedDistance?: number
}) {
  const org = store.organizations.find((o) => o.id === position.orgId)
  return (
    <article className={`opportunity-card ${compact ? "compact" : ""}`}>
      <div className="card-top">
        <Badge tone="green">{position.type}</Badge>
        <button
          className={`save-btn ${saved ? "saved" : ""}`}
          onClick={onSave}
          aria-label={saved ? "Remove saved opportunity" : "Save opportunity"}
          aria-pressed={saved}
        >
          <Icon name="heart" />
          <span>{saved ? "Saved" : "Save"}</span>
        </button>
      </div>
      <h3>{position.title}</h3>
      <span className="org-name">{org?.name}</span>
      {!compact && <p>{position.description}</p>}
      <div className="meta">
        <span>
          <Icon name="pin" size={17} />
          {position.location} · {calculatedDistance ?? position.distance} km
          away
        </span>
        <span>
          <Icon name="calendar" size={17} />
          {displayDate(position.date)} · {position.time}
        </span>
      </div>
      <div className="card-footer">
        <span>{position.spots} spots available</span>
        <Button
          variant="secondary"
          onClick={() => go(`opportunity/${position.id}`)}
        >
          View details <Icon name="arrow" size={17} />
        </Button>
      </div>
    </article>
  )
}

function Saved({
  store,
  user,
  updateStore,
  go,
  toast,
}: {
  store: Store
  user: User
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  const ids = store.favorites[user.id] || []
  const positions = store.positions.filter((p) => ids.includes(p.id))
  const remove = async (id: string) => {
    try {
      await api.unsavePosition(user.id, id)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to remove saved opportunity.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      favorites: { ...s.favorites, [user.id]: ids.filter((x) => x !== id) },
    }))
    toast("Removed from Saved Opportunities.")
  }
  return (
    <div className="page">
      <PageHead
        eyebrow="Your shortlist"
        title="Saved opportunities"
        description={`${positions.length} ${
          positions.length === 1 ? "opportunity" : "opportunities"
        } saved for later.`}
        action={
          <Button onClick={() => go("browse")}>Browse opportunities</Button>
        }
      />
      <div className="opportunity-list saved-list">
        {positions.length ? (
          positions.map((p) => (
            <OpportunityCard
              key={p.id}
              position={p}
              store={store}
              saved
              onSave={() => remove(p.id)}
              go={go}
            />
          ))
        ) : (
          <EmptyState
            title="Nothing saved yet"
            text="Tap the heart on an opportunity to keep it here."
            action={
              <Button onClick={() => go("browse")}>Start browsing</Button>
            }
          />
        )}
      </div>
    </div>
  )
}

function AppliedOpportunities({
  store,
  user,
  go,
}: {
  store: Store
  user: User
  go: (r: string) => void
}) {
  const [tab, setTab] = useState<"all" | "pending" | "accepted">("all")
  const applications = store.applications
    .filter((application) => application.volunteerId === user.id)
    .filter(
      (application) =>
        tab === "all" ||
        (tab === "accepted"
          ? application.status === "Accepted"
          : application.status !== "Accepted" &&
            application.status !== "Rejected"),
    )
  const matchesTab = (
    application: Application,
    item: "all" | "pending" | "accepted",
  ) =>
    item === "all" ||
    (item === "accepted"
      ? application.status === "Accepted"
      : application.status !== "Accepted" && application.status !== "Rejected")
  return (
    <div className="page">
      <PageHead
        eyebrow="Your applications"
        title="Applied opportunities"
        description="Track opportunities you have applied to and their current progress."
        action={
          <Button onClick={() => go("browse")}>Browse opportunities</Button>
        }
      />
      <section className="management-card">
        <div className="tabs">
          {(["all", "pending", "accepted"] as const).map((item) => (
            <button
              key={item}
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
              <span>
                {
                  store.applications.filter(
                    (application) =>
                      application.volunteerId === user.id &&
                      matchesTab(application, item),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="applied-list">
          {applications.map((application) => {
            const position = store.positions.find(
              (item) => item.id === application.positionId,
            )
            if (!position) return null
            const label =
              application.status === "Accepted"
                ? "Accepted"
                : application.status === "Rejected"
                  ? "Declined"
                  : "Pending"
            return (
              <article key={application.id}>
                <div>
                  <Badge
                    tone={
                      application.status === "Accepted"
                        ? "green"
                        : application.status === "Rejected"
                          ? "red"
                          : "amber"
                    }
                  >
                    {label}
                  </Badge>
                  <h3>{position.title}</h3>
                  <p>
                    {
                      store.organizations.find(
                        (organization) => organization.id === position.orgId,
                      )?.name
                    }
                  </p>
                </div>
                <div className="meta">
                  <span>
                    <Icon name="calendar" size={17} />
                    Applied {displayDate(application.date)}
                  </span>
                  <span>
                    <Icon name="pin" size={17} />
                    {position.location}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => go(`opportunity/${position.id}`)}
                >
                  View position
                </Button>
              </article>
            )
          })}
          {!applications.length && (
            <EmptyState
              title={`No ${tab === "all" ? "" : tab} applications`}
              text="Applications matching this tab will appear here."
            />
          )}
        </div>
      </section>
    </div>
  )
}

function OpportunityDetails({
  id,
  store,
  user,
  updateStore,
  go,
  toast,
}: {
  id: string
  store: Store
  user: User
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  const position = store.positions.find((p) => p.id === id)
  const [applyOpen, setApplyOpen] = useState(false)
  const [phone, setPhone] = useState("")
  const [skills, setSkills] = useState("")
  const [availability, setAvailability] = useState("")
  const [resume, setResume] = useState<{
    name: string
    dataUrl: string
  } | null>(null)
  const [message, setMessage] = useState("")
  const [applicationErrors, setApplicationErrors] =
    useState<Record<string, string>>({})
  if (!position)
    return (
      <div className="page">
        <EmptyState
          title="Opportunity not found"
          text="This opportunity may no longer be available."
        />
      </div>
    )
  const org = store.organizations.find((o) => o.id === position.orgId)
  const saved = (store.favorites[user.id] || []).includes(id)
  const applied = store.applications.some(
    (a) => a.positionId === id && a.volunteerId === user.id,
  )
  const toggleSave = async () => {
    const current = store.favorites[user.id] || []
    try {
      if (saved) await api.unsavePosition(user.id, id)
      else await api.savePosition(user.id, id)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to update saved opportunities.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      favorites: {
        ...s.favorites,
        [user.id]: saved ? current.filter((x) => x !== id) : [...current, id],
      },
    }))
    toast(
      saved
        ? "Removed from Saved Opportunities."
        : "Added to Saved Opportunities.",
    )
  }
  const apply = async (event: FormEvent) => {
    event.preventDefault()
    if (applied) return
    const errors: Record<string, string> = {}
    if (!phone.trim()) errors.phone = "Phone number is required."
    if (!skills.trim()) errors.skills = "Relevant skills are required."
    if (!availability.trim())
      errors.availability = "Availability or preferred days are required."
    if (!resume) errors.resume = "A PDF or DOCX resume is required."
    setApplicationErrors(errors)
    if (Object.keys(errors).length) return
    const application: Application = {
      id: uid("app"),
      positionId: id,
      volunteerId: user.id,
      name: user.name,
      email: user.email,
      phone: phone.trim(),
      skills: skills.trim(),
      availability: availability.trim(),
      resumeName: resume!.name,
      resumeDataUrl: resume!.dataUrl,
      resumeText: `${user.name}\nVolunteer Applicant\n\nContact\n${user.email} · ${phone.trim()}\n\nRelevant Skills\n${skills.trim()}\n\nAvailability\n${availability.trim()}`,
      message: message.trim(),
      date: currentSqlDate(),
      status: "New",
    }
    const notification: NotificationRecord | undefined =
      position.notify || org?.notify
        ? {
            id: uid("n"),
            orgId: position.orgId,
            text: `${user.name} applied to ${position.title}.`,
            date: currentSqlDate(),
            read: false,
          }
        : undefined
    try {
      const savedApplication = fromApiApplication(
        await api.createApplication(toApiApplication(application)),
      )
      await api.saveAppliedPosition(user.id, position.id)
      let savedNotification: NotificationRecord | undefined
      if (notification) {
        savedNotification = fromApiNotification(
          await api.createNotification(toApiNotification(notification)),
        )
      }
      updateStore((s) => ({
        ...s,
        applications: [...s.applications, savedApplication],
        notifications: savedNotification
          ? [...s.notifications, savedNotification]
          : s.notifications,
      }))
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to submit application.",
      )
      return
    }
    setApplyOpen(false)
    setApplicationErrors({})
    toast("Application submitted successfully.")
  }
  return (
    <div className="page detail-page">
      <button className="back-link" onClick={() => history.back()}>
        <Icon name="back" size={17} /> Back to Volunteer Opportunities
      </button>
      <section className="detail-hero">
        <div>
          <Badge tone="green">{position.type}</Badge>
          <h1>{position.title}</h1>
          <p className="detail-org">{org?.name}</p>
          <div className="detail-meta">
            <span>
              <Icon name="pin" />
              {position.location} · {position.distance} km away
            </span>
            <span>
              <Icon name="calendar" />
              {displayDate(position.date)} · {position.time}
            </span>
          </div>
        </div>
        <button
          className={`detail-heart ${saved ? "saved" : ""}`}
          onClick={toggleSave}
          aria-label={saved ? "Remove saved opportunity" : "Save opportunity"}
          aria-pressed={saved}
        >
          <Icon name="heart" />
          {saved ? "Saved" : "Save"}
        </button>
      </section>
      <div className="detail-layout">
        <div className="detail-content">
          <InfoSection title="About this opportunity">
            <p>{position.description}</p>
          </InfoSection>
          <InfoSection title="Key responsibilities">
            <ul>
              {position.responsibilities.map((item) => (
                <li key={item}>
                  <Icon name="check" size={18} />
                  {item}
                </li>
              ))}
            </ul>
          </InfoSection>
          <InfoSection title="Requirements">
            <ul>
              {position.requirements.map((item) => (
                <li key={item}>
                  <Icon name="check" size={18} />
                  {item}
                </li>
              ))}
            </ul>
          </InfoSection>
          <InfoSection title="Contact information">
            <div className="contact-details">
              <span>
                <strong>Email</strong>
                {position.contactEmail || org?.email}
              </span>
              {position.contactPhone && (
                <span>
                  <strong>Phone</strong>
                  {position.contactPhone}
                </span>
              )}
            </div>
          </InfoSection>
        </div>
        <aside className="apply-card">
          <span className="eyebrow">Ready to help?</span>
          <h2>Make an impact with {org?.name}</h2>
          <p>We’ll share your profile and message with the organization.</p>
          <div>
            <span>Volunteers needed</span>
            <strong>{position.spots}</strong>
          </div>
          <Button
            className="full"
            disabled={applied}
            onClick={() => setApplyOpen(true)}
          >
            {applied ? (
              <>
                <Icon name="check" /> Applied
              </>
            ) : (
              "Apply now"
            )}
          </Button>
          <small>
            {applied
              ? "Your application has been sent."
              : "Applications take less than a minute."}
          </small>
        </aside>
      </div>
      {applyOpen && (
        <Modal
          title={`Apply for ${position.title}`}
          onClose={() => setApplyOpen(false)}
        >
          <form className="application-form" onSubmit={apply} noValidate>
            <div className="applicant-preview">
              <span className="avatar">{user.name.slice(0, 1)}</span>
              <span>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </span>
            </div>
            <Field
              label={<RequiredLabel>Phone number</RequiredLabel>}
              type="tel"
              placeholder="(519) 555-0123"
              value={phone}
              error={applicationErrors.phone}
              onChange={(event) => {
                setPhone(event.target.value)
                setApplicationErrors((current) => ({
                  ...current,
                  phone: "",
                }))
              }}
            />
            <Field
              label={<RequiredLabel>Relevant skills</RequiredLabel>}
              placeholder="First Aid, Heavy Lifting, Tutoring, Event Support"
              value={skills}
              error={applicationErrors.skills}
              onChange={(event) => {
                setSkills(event.target.value)
                setApplicationErrors((current) => ({
                  ...current,
                  skills: "",
                }))
              }}
            />
            <Field
              label={
                <RequiredLabel>Availability / preferred days</RequiredLabel>
              }
              placeholder="Saturday mornings and Wednesday evenings"
              value={availability}
              error={applicationErrors.availability}
              onChange={(event) => {
                setAvailability(event.target.value)
                setApplicationErrors((current) => ({
                  ...current,
                  availability: "",
                }))
              }}
            />
            <label className="field resume-upload">
              <span>
                <RequiredLabel>Resume upload</RequiredLabel>
              </span>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) {
                    setResume(null)
                    return
                  }
                  if (!/\.(pdf|docx)$/i.test(file.name)) {
                    setResume(null)
                    event.target.value = ""
                    setApplicationErrors((current) => ({
                      ...current,
                      resume: "Select a PDF or DOCX resume file.",
                    }))
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => {
                    setResume({
                      name: file.name,
                      dataUrl: String(reader.result || ""),
                    })
                    setApplicationErrors((current) => ({
                      ...current,
                      resume: "",
                    }))
                  }
                  reader.readAsDataURL(file)
                }}
              />
              {resume && <small className="file-selected">{resume.name}</small>}
              {applicationErrors.resume && (
                <small className="field-error">
                  {applicationErrors.resume}
                </small>
              )}
            </label>
            <TextArea
              label="Short note / message (optional)"
              rows={4}
              placeholder="Share why you're interested in this opportunity."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setApplyOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Submit application</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function InfoSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="info-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function ApplicantReviewDetails({
  application,
  onViewResume,
}: {
  application: Application
  onViewResume: () => void
}) {
  const parts = application.name.trim().split(/\s+/)
  const firstName = parts.slice(0, -1).join(" ") || parts[0]
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "—"
  return (
    <>
      <div className="applicant-detail-grid">
        <div>
          <span>First name</span>
          <strong>{firstName}</strong>
        </div>
        <div>
          <span>Last name</span>
          <strong>{lastName}</strong>
        </div>
        <div>
          <span>Email address</span>
          <strong>{application.email}</strong>
        </div>
        <div>
          <span>Phone number</span>
          <strong>{application.phone}</strong>
        </div>
        <div>
          <span>Application date</span>
          <strong>{displayDate(application.date)}</strong>
        </div>
        <div>
          <span>Availability</span>
          <strong>{application.availability}</strong>
        </div>
      </div>
      <div className="resume-row">
        <div>
          <span>Uploaded resume</span>
          <strong>{application.resumeName}</strong>
        </div>
        <Button type="button" variant="secondary" onClick={onViewResume}>
          <Icon name="eye" size={17} /> View resume
        </Button>
      </div>
      <div className="message-box">
        <span>Relevant skills</span>
        <p>{application.skills}</p>
      </div>
      <div className="message-box">
        <span>Application note</span>
        <p>{application.message || "No additional note was provided."}</p>
      </div>
    </>
  )
}

function ResumePreview({
  application,
  onClose,
}: {
  application: Application
  onClose: () => void
}) {
  const isPdf = application.resumeDataUrl.startsWith("data:application/pdf")
  return (
    <Modal title={`Resume — ${application.name}`} onClose={onClose}>
      <div className="resume-preview-head">
        <div>
          <span>File name</span>
          <strong>{application.resumeName}</strong>
        </div>
        {application.resumeDataUrl && (
          <a
            className="resume-download"
            href={application.resumeDataUrl}
            download={application.resumeName}
          >
            Download original
          </a>
        )}
      </div>
      {isPdf ? (
        <iframe
          className="resume-frame"
          src={application.resumeDataUrl}
          title={`${application.name} resume`}
        />
      ) : (
        <pre className="resume-document">{application.resumeText}</pre>
      )}
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={onClose}>
          Close preview
        </Button>
      </div>
    </Modal>
  )
}

// ============================================================================
// SECTION 7: ORGANIZATION SCREENS
// My Posts, create/edit form, per-position applicants, and all applicants.
// ============================================================================

function OrganizationDashboard({
  store,
  user,
  updateStore,
  go,
  toast,
}: {
  store: Store
  user: User
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  const [search, setSearch] = useState("")
  const [postFilter, setPostFilter] = useState<"all" | "active">("all")
  const org = store.organizations.find((o) => o.id === user.orgId)!
  const orgPosts = store.positions.filter((p) => p.orgId === user.orgId)
  const posts = orgPosts.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) &&
      (postFilter === "all" || p.status === "Active"),
  )
  const toggleNotify = async () => {
    const enabled = !org.notify
    try {
      await api.updateOrganizationNotifications(org.id, enabled)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to update notifications.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      organizations: s.organizations.map((o) =>
        o.id === org.id ? { ...o, notify: enabled } : o,
      ),
    }))
    toast(`Applicant notifications ${org.notify ? "disabled" : "enabled"}.`)
  }
  return (
    <div className="page">
      <PageHead
        eyebrow={org.name}
        title="Manage your volunteer positions"
        description="Create opportunities, review applicants, and keep your team up to date."
        action={
          <Button icon="plus" onClick={() => go("new-position")}>
            New position
          </Button>
        }
      />
      <section className="management-card">
        <div className="management-head">
          <div>
            <h2>My posts</h2>
            <p>Only positions created by {org.name} are shown.</p>
          </div>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={org.notify}
              onChange={toggleNotify}
            />
            <span className="switch"></span>
            <span>Get notifications for new applicants</span>
          </label>
        </div>
        <div className="table-tools">
          <label className="search-box">
            <Icon name="search" />
            <input
              placeholder="Search your positions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <span>{posts.length} posts</span>
        </div>
        <div className="post-filters">
          <button
            className={postFilter === "all" ? "active" : ""}
            onClick={() => setPostFilter("all")}
          >
            Total posts <span>{orgPosts.length}</span>
          </button>
          <button
            className={postFilter === "active" ? "active" : ""}
            onClick={() => setPostFilter("active")}
          >
            Active positions{" "}
            <span>{orgPosts.filter((p) => p.status === "Active").length}</span>
          </button>
        </div>
        <div className="post-list">
          {posts.map((p) => (
            <article className="post-card" key={p.id}>
              <div className="post-main">
                <div>
                  <Badge tone={p.status === "Active" ? "green" : "neutral"}>
                    {p.status}
                  </Badge>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                </div>
                <div className="post-meta">
                  <span>
                    <Icon name="pin" />
                    {p.location}
                  </span>
                  <span>
                    <Icon name="calendar" />
                    {displayDate(p.date)} · {p.time}
                  </span>
                  <span>
                    <Icon name="user" />
                    {p.spots} volunteer spots
                  </span>
                </div>
              </div>
              <div className="post-side">
                <strong>
                  {
                    store.applications.filter(
                      (a) => a.positionId === p.id && a.status !== "Rejected",
                    ).length
                  }
                </strong>
                <span>applicants</span>
                <Button
                  variant="secondary"
                  onClick={() => go(`applicants/${p.id}`)}
                >
                  View applicants
                </Button>
                <Button
                  variant="ghost"
                  icon="edit"
                  onClick={() => go(`edit/${p.id}`)}
                >
                  Edit position
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function PositionForm({
  id,
  store,
  user,
  updateStore,
  go,
  toast,
}: {
  id?: string
  store: Store
  user: User
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  // An ID means edit mode. Ownership is checked here so organizations cannot
  // edit another organization's posting.
  const existing = id
    ? store.positions.find((p) => p.id === id && p.orgId === user.orgId)
    : undefined
  const org = store.organizations.find((o) => o.id === user.orgId)!
  const existingDate = (existing?.date || "").split("-")
  const existingTimes = (existing?.time || "").split(" – ")
  const years = Array.from({ length: 6 }, (_, index) =>
    String(new Date().getFullYear() + index),
  )
  const months = Array.from({ length: 12 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
  )
  const days = Array.from({ length: 31 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
  )
  const times = Array.from({ length: 32 }, (_, index) => {
    const minutes = 6 * 60 + index * 30
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${
      hour >= 12 ? "PM" : "AM"
    }`
  })
  const [error, setError] = useState("")
  // Date/time parts stay separate for dropdowns and are combined only on save.
  const [form, setForm] = useState({
    title: existing?.title || "",
    organization: org.name,
    location: existing?.location || "",
    year: existingDate[0] || years[0],
    month: existingDate[1] || "01",
    day: existingDate[2] || "01",
    startTime: existingTimes[0] || "9:00 AM",
    endTime: existingTimes[1] || "12:00 PM",
    spots: String(existing?.spots || ""),
    type: existing?.type || "Community Support",
    commitment: existing?.commitment || "Flexible",
    distance: String(existing?.distance || 5),
    description: existing?.description || "",
    requirements: existing?.requirements.join("\n") || "",
    responsibilities: existing?.responsibilities.join("\n") || "",
    status: existing?.status || "Active" as PostStatus,
    contactEmail: existing?.contactEmail || org.email,
    contactPhone: existing?.contactPhone || "",
  })
  const change = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))
  // Validates calendar day, time order, required fields, and contact formats.
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (
      !form.title ||
      !form.organization ||
      !form.location ||
      !form.year ||
      !form.month ||
      !form.day ||
      !form.startTime ||
      !form.endTime ||
      !form.spots ||
      !form.description
    )
      return setError("Complete all required fields before continuing.")
    const maxDay = new Date(Number(form.year), Number(form.month), 0).getDate()
    if (Number(form.day) > maxDay)
      return setError(`The selected month has only ${maxDay} days.`)
    const toMinutes = (value: string) => {
      const [clock, period] = value.split(" ")
      const [hours, minutes] = clock.split(":").map(Number)
      return ((hours % 12) + (period === "PM" ? 12 : 0)) * 60 + minutes
    }
    if (toMinutes(form.endTime) <= toMinutes(form.startTime))
      return setError("End time must be after the start time.")
    if (!form.contactEmail.trim() && !form.contactPhone.trim())
      return setError("Provide at least one contact method.")
    if (
      form.contactEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)
    )
      return setError("Enter a valid contact email address.")
    if (
      form.contactPhone.trim() &&
      !/^[+()\d\s.-]{7,20}$/.test(form.contactPhone)
    )
      return setError("Enter a valid contact phone number.")
    const position: Position = {
      id: existing?.id || uid("p"),
      title: form.title,
      orgId: org.id,
      location: form.location,
      distance: Number(form.distance),
      date: `${form.year}-${form.month.padStart(2, "0")}-${form.day.padStart(2, "0")}`,
      time: `${form.startTime} – ${form.endTime}`,
      spots: Number(form.spots),
      type: form.type,
      commitment: form.commitment,
      description: form.description,
      requirements: form.requirements.split("\n").filter(Boolean),
      responsibilities: form.responsibilities.split("\n").filter(Boolean),
      status: form.status,
      notify: existing?.notify || false,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
    }
    let savedPosition: Position
    try {
      savedPosition = fromApiPosition(
        existing
          ? await api.updatePosition(existing.id, toApiPosition(position))
          : await api.createPosition(toApiPosition(position)),
      )
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save position.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      positions: existing
        ? s.positions.map((p) => (p.id === existing.id ? savedPosition : p))
        : [...s.positions, savedPosition],
    }))
    toast(
      existing
        ? "Position updated successfully."
        : "New position published successfully.",
    )
    go("dashboard")
  }
  if (id && !existing)
    return (
      <div className="page">
        <EmptyState
          title="You can’t edit this position"
          text="Organizations can only edit their own postings."
        />
      </div>
    )
  return (
    <div className="page form-page">
      <button className="back-link" onClick={() => go("dashboard")}>
        <Icon name="back" size={17} /> Back to My Posts
      </button>
      <PageHead
        eyebrow={existing ? "Update an opportunity" : "Create an opportunity"}
        title={existing ? "Edit position" : "Create new position"}
        description="Fields marked with an asterisk are required."
      />
      <form className="form-card position-form" onSubmit={submit}>
        <div className="form-section">
          <h2>Position details</h2>
          <div className="form-grid">
            <Field
              label={<RequiredLabel>Position title</RequiredLabel>}
              value={form.title}
              onChange={(e) => change("title", e.target.value)}
              placeholder="e.g. Community Garden Volunteer"
            />
            <Field
              label={<RequiredLabel>Organization name</RequiredLabel>}
              value={form.organization}
              readOnly
            />
            <Field
              label={<RequiredLabel>Location</RequiredLabel>}
              value={form.location}
              onChange={(e) => change("location", e.target.value)}
              placeholder="Venue or neighbourhood"
            />
            <Field
              label="Approximate distance (km)"
              min="0"
              step="0.1"
              inputMode="decimal"
              type="number"
              value={form.distance}
              onChange={(e) => change("distance", e.target.value)}
            />
            <div className="field form-wide">
              <span>
                <RequiredLabel>Date</RequiredLabel>
              </span>
              <div className="date-selects">
                <select
                  value={form.year}
                  onChange={(e) => change("year", e.target.value)}
                  aria-label="Year"
                >
                  {years.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  value={form.month}
                  onChange={(e) => change("month", e.target.value)}
                  aria-label="Month"
                >
                  {months.map((value) => (
                    <option key={value} value={value}>
                      {new Date(2026, Number(value) - 1).toLocaleString("en", {
                        month: "long",
                      })}
                    </option>
                  ))}
                </select>
                <select
                  value={form.day}
                  onChange={(e) => change("day", e.target.value)}
                  aria-label="Day"
                >
                  {days.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
            </div>
            <SelectField
              label={<RequiredLabel>Start time</RequiredLabel>}
              value={form.startTime}
              onChange={(e) => change("startTime", e.target.value)}
            >
              {times.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </SelectField>
            <SelectField
              label={<RequiredLabel>End time</RequiredLabel>}
              value={form.endTime}
              onChange={(e) => change("endTime", e.target.value)}
            >
              {times.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </SelectField>
            <Field
              label={<RequiredLabel>Number of volunteers needed</RequiredLabel>}
              type="number"
              min="1"
              value={form.spots}
              onChange={(e) => change("spots", e.target.value)}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option>Active</option>
              <option>Paused</option>
            </SelectField>
            <SelectField
              label="Opportunity type"
              value={form.type}
              onChange={(e) => change("type", e.target.value)}
            >
              {[
                "Environment",
                "Community Support",
                "Education",
                "Health & Wellness",
                "Animals",
                "Arts & Culture",
                "Other",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </SelectField>
            <SelectField
              label="Time commitment"
              value={form.commitment}
              onChange={(e) => change("commitment", e.target.value)}
            >
              <option>One-time</option>
              <option>Weekly</option>
              <option>Flexible</option>
            </SelectField>
          </div>
        </div>
        <div className="form-section">
          <h2>
            Contact information <span className="required">*</span>
          </h2>
          <p className="section-help">Provide at least one contact method.</p>
          <div className="form-grid">
            <Field
              label="Contact email address"
              type="email"
              value={form.contactEmail}
              onChange={(e) => change("contactEmail", e.target.value)}
              placeholder="contact@organization.org"
            />
            <Field
              label="Contact phone number"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => change("contactPhone", e.target.value)}
              placeholder="(519) 555-0123"
            />
          </div>
        </div>
        <div className="form-section">
          <h2>About the opportunity</h2>
          <div className="form-grid">
            <TextArea
              className="form-wide"
              label={<RequiredLabel>Description</RequiredLabel>}
              rows={5}
              value={form.description}
              onChange={(e) => change("description", e.target.value)}
              placeholder="Describe the opportunity and its community impact."
            />
            <TextArea
              label="Requirements"
              rows={6}
              value={form.requirements}
              onChange={(e) => change("requirements", e.target.value)}
              placeholder="One requirement per line"
            />
            <TextArea
              label="Responsibilities / Additional details"
              rows={6}
              value={form.responsibilities}
              onChange={(e) => change("responsibilities", e.target.value)}
              placeholder="One responsibility per line"
            />
          </div>
        </div>
        {error && <div className="form-alert">{error}</div>}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={() => go("dashboard")}>
            Cancel
          </Button>
          <Button type="submit">
            {existing ? "Save changes" : "Post position"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Applicants({
  id,
  store,
  updateStore,
  go,
  toast,
}: {
  id: string
  store: Store
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  const position = store.positions.find((p) => p.id === id)!
  // Rejected records remain internally for volunteer history but leave active org lists.
  const applications = store.applications.filter(
    (a) => a.positionId === id && a.status !== "Rejected",
  )
  const [selected, setSelected] = useState<Application | null>(null)
  const [resumePreview, setResumePreview] = useState<Application | null>(null)
  const splitName = (name: string) => {
    const parts = name.trim().split(/\s+/)
    return {
      first: parts.slice(0, -1).join(" ") || parts[0],
      last: parts.length > 1 ? parts[parts.length - 1] : "",
    }
  }
  const accept = async (appId: string) => {
    try {
      await api.updateApplication(appId, "Accepted")
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Unable to accept applicant.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      applications: s.applications.map((a) =>
        a.id === appId ? { ...a, status: "Accepted" } : a,
      ),
    }))
    toast("Applicant accepted.")
  }
  const reject = async (appId: string) => {
    try {
      await api.updateApplication(appId, "Rejected")
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to reject application.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      applications: s.applications.map((a) =>
        a.id === appId ? { ...a, status: "Rejected" } : a,
      ),
    }))
    toast("Application declined and removed from the active list.")
  }
  const toggle = async () => {
    const enabled = !position.notify
    try {
      await api.updatePosition(id, { notify: enabled })
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to update notifications.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      positions: s.positions.map((p) =>
        p.id === id ? { ...p, notify: enabled } : p,
      ),
    }))
    toast(`Position notifications ${position.notify ? "disabled" : "enabled"}.`)
  }
  return (
    <div className="page">
      <button className="back-link" onClick={() => go("dashboard")}>
        <Icon name="back" size={17} /> Back to My Posts
      </button>
      <PageHead
        eyebrow="Applicant management"
        title={position.title}
        description={`${position.location} · ${displayDate(position.date)}`}
      />
      <section className="management-card">
        <div className="management-head">
          <div>
            <h2>{applications.length} applicants</h2>
            <p>Open an applicant to review their note and make a decision.</p>
          </div>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={position.notify}
              onChange={toggle}
            />
            <span className="switch"></span>
            <span>Email me when a new applicant applies to this position</span>
          </label>
        </div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>First name</th>
                <th>Last name</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const name = splitName(a.name)
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{name.first}</strong>
                      <small>{a.email}</small>
                    </td>
                    <td>
                      <strong>{name.last}</strong>
                    </td>
                    <td>{displayDate(a.date)}</td>
                    <td>
                      <Badge tone={a.status === "Accepted" ? "green" : "amber"}>
                        {a.status === "Accepted" ? "Accepted" : "Pending"}
                      </Badge>
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => setSelected(a)}>
                        View more
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!applications.length && (
            <EmptyState
              title="No applicants yet"
              text="New applications will appear here."
            />
          )}
        </div>
      </section>
      {selected && (
        <Modal title="Review applicant" onClose={() => setSelected(null)}>
          <ApplicantReviewDetails
            application={selected}
            onViewResume={() => setResumePreview(selected)}
          />
          <div className="modal-actions decision-actions">
            <Button
              variant="danger"
              onClick={() => {
                reject(selected.id)
                setSelected(null)
              }}
            >
              Reject applicant
            </Button>
            <Button
              icon="check"
              onClick={() => {
                accept(selected.id)
                setSelected(null)
              }}
            >
              Approve applicant
            </Button>
          </div>
        </Modal>
      )}
      {resumePreview && (
        <ResumePreview
          application={resumePreview}
          onClose={() => setResumePreview(null)}
        />
      )}
    </div>
  )
}

function OrganizationAllApplicants({
  store,
  user,
  updateStore,
  go,
  toast,
}: {
  store: Store
  user: User
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Application | null>(null)
  const [resumePreview, setResumePreview] = useState<Application | null>(null)
  const orgPosts = store.positions.filter((p) => p.orgId === user.orgId)
  const applications = store.applications
    .filter(
      (a) =>
        a.status !== "Rejected" && orgPosts.some((p) => p.id === a.positionId),
    )
    .filter((a) =>
      `${a.name} ${a.email} ${store.positions.find((p) => p.id === a.positionId)?.title}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
  const splitName = (name: string) => {
    const parts = name.trim().split(/\s+/)
    return {
      first: parts.slice(0, -1).join(" ") || parts[0],
      last: parts.length > 1 ? parts[parts.length - 1] : "",
    }
  }
  const setStatus = async (id: string, status: "Accepted" | "Rejected") => {
    try {
      await api.updateApplication(id, status)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to update application.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      applications: s.applications.map((a) =>
        a.id === id ? { ...a, status } : a,
      ),
    }))
    setSelected(null)
    toast(`Applicant moved to ${status}.`)
  }
  return (
    <div className="page">
      <PageHead
        eyebrow="Organization applicants"
        title="All applicants"
        description={`${applications.length} applications across all of your volunteer positions.`}
      />
      <section className="management-card">
        <div className="table-tools">
          <label className="search-box">
            <Icon name="search" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search first name, last name, email, or position"
            />
          </label>
          <span>{applications.length} applicants</span>
        </div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>First name</th>
                <th>Last name</th>
                <th>Email</th>
                <th>Position</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const name = splitName(a.name)
                const position = store.positions.find(
                  (p) => p.id === a.positionId,
                )!
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{name.first}</strong>
                    </td>
                    <td>
                      <strong>{name.last}</strong>
                    </td>
                    <td>{a.email}</td>
                    <td>
                      <button
                        className="table-link"
                        onClick={() => go(`applicants/${position.id}`)}
                      >
                        {position.title}
                      </button>
                    </td>
                    <td>
                      <Badge tone={a.status === "Accepted" ? "green" : "amber"}>
                        {a.status === "Accepted" ? "Accepted" : "Pending"}
                      </Badge>
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => setSelected(a)}>
                        View more
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!applications.length && (
            <EmptyState
              title="No applicants found"
              text="New applications across all positions will appear here."
            />
          )}
        </div>
      </section>
      {selected && (
        <Modal
          title={`Review ${selected.name}`}
          onClose={() => setSelected(null)}
        >
          <ApplicantReviewDetails
            application={selected}
            onViewResume={() => setResumePreview(selected)}
          />
          <div className="modal-actions decision-actions">
            <Button
              variant="danger"
              onClick={() => setStatus(selected.id, "Rejected")}
            >
              Reject
            </Button>
            <Button
              icon="check"
              onClick={() => setStatus(selected.id, "Accepted")}
            >
              Approve
            </Button>
          </div>
        </Modal>
      )}
      {resumePreview && (
        <ResumePreview
          application={resumePreview}
          onClose={() => setResumePreview(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// SECTION 8: ADMIN SCREENS
// Position/org/applicant tables plus pending organization approval requests.
// ============================================================================

const organizationValue = (value?: string) => value?.trim() || "Not provided"

function organizationContactName(store: Store, organization: Organization) {
  return store.users.find(
    (user) =>
      user.role === "organization" &&
      (user.orgId === organization.id || user.id === organization.id),
  )?.name
}

function OrganizationAvatar({
  organization,
  size = "medium",
}: {
  organization: Organization
  size?: "small" | "medium" | "large"
}) {
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => setImageFailed(false), [organization.logoUrl])
  const initials =
    organization.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "OR"

  return (
    <span className={`organization-avatar organization-avatar-${size}`}>
      {organization.logoUrl && !imageFailed ? (
        <img
          src={organization.logoUrl}
          alt={`${organization.name} logo`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  )
}

function OrganizationReviewDetails({
  organization,
  contactName,
  singleSection = false,
}: {
  organization: Organization
  contactName?: string
  singleSection?: boolean
}) {
  const website = organization.website?.trim()
  const organizationFields = (
    <div className="organization-detail-grid">
      <div>
        <span>Organization name</span>
        <strong>{organizationValue(organization.name)}</strong>
      </div>
      <div>
        <span>Organization website</span>
        <strong>
          {website ? (
            <a href={website} target="_blank" rel="noreferrer">
              {website}
            </a>
          ) : (
            "Not provided"
          )}
        </strong>
      </div>
      <div>
        <span>Logo or profile picture</span>
        <strong>
          {organization.logoUrl ? (
            <a href={organization.logoUrl} target="_blank" rel="noreferrer">
              View image
            </a>
          ) : (
            "Not provided"
          )}
        </strong>
      </div>
      <div>
        <span>Charitable registration number</span>
        <strong>
          {organizationValue(organization.charitableRegistrationNumber)}
        </strong>
      </div>
      <div className="organization-detail-wide">
        <span>Mission statement</span>
        <p>{organizationValue(organization.missionStatement)}</p>
      </div>
      <div className="organization-detail-wide">
        <span>Additional organization details</span>
        <p>{organizationValue(organization.description)}</p>
      </div>
    </div>
  )
  const accountFields = (
    <div className="organization-detail-grid">
      <div>
        <span>Registered contact name</span>
        <strong>{organizationValue(contactName)}</strong>
      </div>
      <div>
        <span>Email address</span>
        <strong>{organizationValue(organization.email)}</strong>
      </div>
      <div>
        <span>Organization approval status</span>
        <strong>{organization.status}</strong>
      </div>
    </div>
  )

  if (singleSection) {
    return (
      <section className="organization-review">
        <div className="organization-review-heading">
          <OrganizationAvatar organization={organization} size="large" />
          <h3>Organization Details</h3>
        </div>
        {organizationFields}
        <div className="organization-detail-grid organization-contact-grid">
          <div>
            <span>Organization contact name</span>
            <strong>{organizationValue(contactName)}</strong>
          </div>
          <div>
            <span>Organization email</span>
            <strong>{organizationValue(organization.email)}</strong>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="organization-review">
      <section>
        <div className="organization-review-heading">
          <OrganizationAvatar organization={organization} size="large" />
          <h3>Organization Information</h3>
        </div>
        {organizationFields}
      </section>
      <section>
        <h3>Account Information</h3>
        {accountFields}
      </section>
    </div>
  )
}

function AdminDashboard({
  store,
  updateStore,
  go,
  toast,
}: {
  store: Store
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  // Main admin table state.
  const [tab, setTab] = useState<"positions" | "organizations" | "applicants">(
    "positions",
  )
  const [search, setSearch] = useState("")
  // Applicant and position sorts are independent because they belong to different tabs.
  const [applicantSort, setApplicantSort] = useState<"last-asc" | "last-desc">(
    "last-asc",
  )
  const [positionSort, setPositionSort] =
    useState<"date-newest" | "date-oldest" | "applicants-high" | "applicants-low">(
      "date-newest",
    )
  // The text search narrows options in the organization filter dropdown.
  const [organizationFilter, setOrganizationFilter] = useState("all")
  const [organizationSearch, setOrganizationSearch] = useState("")
  // One reusable modal state powers position, organization, applicant, and delete details.
  const [selected, setSelected] = useState<{
    title: string
    body: ReactNode
    actions?: ReactNode
    wide?: boolean
  } | null>(null)
  const includes = (text: string) =>
    text.toLowerCase().includes(search.toLowerCase())
  const pending = store.organizations.filter(
    (o) => o.status === "Pending",
  ).length
  const setOrganizationStatus = async (id: string, status: OrgStatus) => {
    try {
      await api.updateOrganizationStatus(id, status)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to update organization.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      organizations: s.organizations.map((o) =>
        o.id === id ? { ...o, status } : o,
      ),
    }))
    setSelected(null)
    toast(`Organization ${status === "Approved" ? "approved" : "rejected"}.`)
  }
  const splitName = (name: string) => {
    const parts = name.trim().split(/\s+/)
    return {
      first: parts.slice(0, -1).join(" ") || parts[0],
      last: parts.length > 1 ? parts[parts.length - 1] : "",
    }
  }
  // Group by email so applicants with multiple applications appear once in Admin.
  const matchingApplications = store.applications.filter((a) => {
    const p = store.positions.find((x) => x.id === a.positionId)
    return includes(
      `${splitName(a.name).first} ${splitName(a.name).last} ${a.email} ${p?.title}`,
    )
  })
  const sortedApplicants = Array.from(
    new Map(
      matchingApplications.map((application) => [
        application.email.toLowerCase(),
        application,
      ]),
    ).values(),
  ).sort((a, b) =>
    applicantSort === "last-asc"
      ? splitName(a.name).last.localeCompare(splitName(b.name).last)
      : splitName(b.name).last.localeCompare(splitName(a.name).last),
  )
  const organizationOptions = store.organizations.filter((organization) =>
    organization.name.toLowerCase().includes(organizationSearch.toLowerCase()),
  )
  // Search, organization filter, and sort are deliberately chained together.
  const sortedPositions = store.positions
    .filter((position) =>
      includes(
        `${position.title} ${position.location} ${store.organizations.find((organization) => organization.id === position.orgId)?.name}`,
      ),
    )
    .filter(
      (position) =>
        organizationFilter === "all" || position.orgId === organizationFilter,
    )
    .sort((a, b) => {
      if (positionSort === "date-newest") return b.date.localeCompare(a.date)
      if (positionSort === "date-oldest") return a.date.localeCompare(b.date)
      const aCount = store.applications.filter(
        (application) =>
          application.positionId === a.id && application.status !== "Rejected",
      ).length
      const bCount = store.applications.filter(
        (application) =>
          application.positionId === b.id && application.status !== "Rejected",
      ).length
      return positionSort === "applicants-high"
        ? bCount - aCount
        : aCount - bCount
    })
  const deletePosition = async (position: Position) => {
    try {
      await api.deletePosition(position.id)
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Unable to delete position.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      positions: s.positions.filter((item) => item.id !== position.id),
      applications: s.applications.filter(
        (application) => application.positionId !== position.id,
      ),
      favorites: Object.fromEntries(
        Object.entries(s.favorites).map(([userId, ids]) => [
          userId,
          ids.filter((positionId) => positionId !== position.id),
        ]),
      ),
    }))
    setSelected(null)
    toast("Volunteer position deleted.")
  }
  // Admin deletion always requires this in-app confirmation before mutating Store.
  const requestPositionDeletion = (position: Position) =>
    setSelected({
      title: "Delete volunteer position?",
      body: (
        <p>
          Permanently delete <strong>{position.title}</strong>? Related
          applications and saved references will also be removed.
        </p>
      ),
      actions: (
        <>
          <Button variant="ghost" onClick={() => setSelected(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => deletePosition(position)}>
            Delete position
          </Button>
        </>
      ),
    })
  const applicantSkills = (application: Application) =>
    application.skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean)
  return (
    <div className="page">
      <PageHead
        eyebrow="United Way administration"
        title="United Way Admin dashboard"
        description="You are managing organizations, positions, and applications across the entire Portal—not an individual organization account."
        action={
          <Button variant="secondary" onClick={() => go("pending-requests")}>
            Pending requests <span className="button-count">{pending}</span>
          </Button>
        }
      />
      <section className="management-card admin-card">
        <div className="tabs">
          {(["positions", "organizations", "applicants"] as const).map(
            (item) => (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                onClick={() => {
                  setTab(item)
                  setSearch("")
                }}
              >
                {item}
                <span>
                  {item === "positions"
                    ? store.positions.length
                    : item === "organizations"
                      ? store.organizations.length
                      : store.applications.length}
                </span>
              </button>
            ),
          )}
        </div>
        <div className="table-tools admin-tools">
          <label className="search-box">
            <Icon name="search" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "applicants"
                  ? "Search first name, last name, email, or position"
                  : `Search ${tab}`
              }
            />
          </label>
          {tab === "positions" && (
            <>
              <input
                className="compact-input"
                value={organizationSearch}
                onChange={(e) => setOrganizationSearch(e.target.value)}
                placeholder="Find organization"
                aria-label="Search organizations for filter"
              />
              <select
                className="sort-select"
                value={organizationFilter}
                onChange={(e) => setOrganizationFilter(e.target.value)}
                aria-label="Filter positions by organization"
              >
                <option value="all">All Organizations</option>
                {organizationOptions.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
              <select
                className="sort-select"
                value={positionSort}
                onChange={(e) =>
                  setPositionSort(e.target.value as typeof positionSort)
                }
                aria-label="Sort positions"
              >
                <option value="date-newest">Date (Newest First)</option>
                <option value="date-oldest">Date (Oldest First)</option>
                <option value="applicants-high">
                  Applicants (Highest First)
                </option>
                <option value="applicants-low">
                  Applicants (Lowest First)
                </option>
              </select>
            </>
          )}
          {tab === "organizations" && (
            <Button variant="secondary" onClick={() => go("pending-requests")}>
              Pending requests ({pending})
            </Button>
          )}
          {tab === "applicants" && (
            <select
              className="sort-select"
              value={applicantSort}
              onChange={(e) =>
                setApplicantSort(e.target.value as "last-asc" | "last-desc")
              }
              aria-label="Sort applicants by last name"
            >
              <option value="last-asc">Last name A–Z</option>
              <option value="last-desc">Last name Z–A</option>
            </select>
          )}
        </div>
        <div className="data-table-wrap">
          {tab === "positions" && (
            <table>
              <thead>
                <tr>
                  <th>Position title</th>
                  <th>Organization</th>
                  <th>Location</th>
                  <th>Date</th>
                  <th>Applicants</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((p) => {
                  const positionApps = store.applications.filter(
                    (a) => a.positionId === p.id && a.status !== "Rejected",
                  )
                  const organization = store.organizations.find(
                    (o) => o.id === p.orgId,
                  )
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.title}</strong>
                      </td>
                      <td>
                        {
                          store.organizations.find((o) => o.id === p.orgId)
                            ?.name
                        }
                      </td>
                      <td>{p.location}</td>
                      <td>{displayDate(p.date)}</td>
                      <td>{positionApps.length}</td>
                      <td>
                        <Badge
                          tone={p.status === "Active" ? "green" : "neutral"}
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="table-actions">
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setSelected({
                                title: p.title,
                                wide: true,
                                body: (
                                  <>
                                    <div className="position-view-grid">
                                      <div>
                                        <span>Organization</span>
                                        <strong>{organization?.name}</strong>
                                      </div>
                                      <div>
                                        <span>Applicants</span>
                                        <strong>{positionApps.length}</strong>
                                      </div>
                                      <div>
                                        <span>Volunteers needed</span>
                                        <strong>{p.spots}</strong>
                                      </div>
                                      <div>
                                        <span>Status</span>
                                        <strong>{p.status}</strong>
                                      </div>
                                    </div>
                                    <p>{p.description}</p>
                                    <div className="message-box">
                                      <span>Location and schedule</span>
                                      <p>
                                        {p.location}
                                        <br />
                                        {displayDate(p.date)} · {p.time}
                                      </p>
                                    </div>
                                    <div className="message-box">
                                      <span>Contact information</span>
                                      <p>
                                        {p.contactEmail || organization?.email}
                                        {p.contactPhone
                                          ? ` · ${p.contactPhone}`
                                          : ""}
                                      </p>
                                    </div>
                                    {organization && (
                                      <OrganizationReviewDetails
                                        organization={organization}
                                        contactName={organizationContactName(
                                          store,
                                          organization,
                                        )}
                                        singleSection
                                      />
                                    )}
                                  </>
                                ),
                              })
                            }
                          >
                            View
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => requestPositionDeletion(p)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {tab === "organizations" && (
            <table>
              <thead>
                <tr>
                  <th>Organization name</th>
                  <th>Contact email</th>
                  <th>Approval status</th>
                  <th>Active posts</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {store.organizations
                  .filter((o) => includes(`${o.name} ${o.email}`))
                  .map((o) => (
                    <tr key={o.id}>
                      <td>
                        <div className="organization-table-name">
                          <OrganizationAvatar organization={o} size="small" />
                          <strong>{o.name}</strong>
                        </div>
                      </td>
                      <td>{o.email}</td>
                      <td>
                        <Badge
                          tone={
                            o.status === "Approved"
                              ? "green"
                              : o.status === "Pending"
                                ? "amber"
                                : "red"
                          }
                        >
                          {o.status}
                        </Badge>
                      </td>
                      <td>
                        {
                          store.positions.filter(
                            (p) => p.orgId === o.id && p.status === "Active",
                          ).length
                        }
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setSelected({
                              title: o.name,
                              wide: true,
                              body: (
                                <OrganizationReviewDetails
                                  organization={o}
                                  contactName={organizationContactName(
                                    store,
                                    o,
                                  )}
                                />
                              ),
                              actions:
                                o.status === "Pending" ? (
                                  <>
                                    <Button
                                      variant="danger"
                                      onClick={() =>
                                        setOrganizationStatus(o.id, "Rejected")
                                      }
                                    >
                                      Decline organization
                                    </Button>
                                    <Button
                                      icon="check"
                                      onClick={() =>
                                        setOrganizationStatus(o.id, "Approved")
                                      }
                                    >
                                      Approve organization
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="secondary"
                                    onClick={() => setSelected(null)}
                                  >
                                    Close
                                  </Button>
                                ),
                            })
                          }
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          {tab === "applicants" && (
            <table>
              <thead>
                <tr>
                  <th>First name</th>
                  <th>Last name</th>
                  <th>Email</th>
                  <th>Positions applied for</th>
                  <th>Total positions</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {sortedApplicants.map((a) => {
                  const name = splitName(a.name)
                  const applicantApplications = store.applications.filter(
                    (item) =>
                      item.email.toLowerCase() === a.email.toLowerCase(),
                  )
                  const positions = applicantApplications
                    .map((application) =>
                      store.positions.find(
                        (position) => position.id === application.positionId,
                      ),
                    )
                    .filter(Boolean) as Position[]
                  const skills = applicantSkills(a)
                  return (
                    <tr key={a.email}>
                      <td>
                        <strong>{name.first}</strong>
                      </td>
                      <td>
                        <strong>{name.last}</strong>
                      </td>
                      <td>{a.email}</td>
                      <td>
                        {positions[0]?.title || "Position unavailable"}
                        {positions.length > 1 && (
                          <small>+{positions.length - 1} more</small>
                        )}
                      </td>
                      <td>{positions.length}</td>
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setSelected({
                              title: `Applicant: ${a.name}`,
                              body: (
                                <>
                                  <div className="person-detail">
                                    <span className="avatar large">
                                      {a.name
                                        .split(" ")
                                        .map((part) => part[0])
                                        .join("")}
                                    </span>
                                    <h3>
                                      {name.first} {name.last}
                                    </h3>
                                    <p>
                                      {a.email}
                                      <br />
                                      (519) 555-
                                      {a.id.slice(-4).padStart(4, "0")}
                                    </p>
                                  </div>
                                  <div className="message-box">
                                    <span>Skills</span>
                                    <p>{skills.join(" · ")}</p>
                                  </div>
                                  <div className="application-history">
                                    <span>Positions and application dates</span>
                                    {applicantApplications.map(
                                      (application) => {
                                        const position = store.positions.find(
                                          (item) =>
                                            item.id === application.positionId,
                                        )
                                        return (
                                          <div key={application.id}>
                                            <strong>
                                              {position?.title ||
                                                "Deleted position"}
                                            </strong>
                                            <small>
                                              {displayDate(application.date)}
                                            </small>
                                            <p>{application.message}</p>
                                          </div>
                                        )
                                      },
                                    )}
                                  </div>
                                </>
                              ),
                            })
                          }
                        >
                          View details
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {selected && (
        <Modal
          title={selected.title}
          onClose={() => setSelected(null)}
          wide={selected.wide}
        >
          {selected.body}
          <div className="modal-actions decision-actions">
            {selected.actions || (
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Close
              </Button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function PendingRequests({
  store,
  updateStore,
  go,
  toast,
}: {
  store: Store
  updateStore: (fn: (s: Store) => Store) => void
  go: (r: string) => void
  toast: (s: string) => void
}) {
  const pending = store.organizations.filter((o) => o.status === "Pending")
  const [search, setSearch] = useState("")
  const matchingPending = pending.filter((organization) =>
    [
      organization.name,
      organization.email,
      organization.website,
      organization.charitableRegistrationNumber,
      organization.missionStatement,
      organization.description,
      organizationContactName(store, organization),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  const [decision, setDecision] = useState<{
    org: Organization
    status: "Approved" | "Rejected"
  } | null>(null)
  const [viewingOrganization, setViewingOrganization] =
    useState<Organization | null>(null)
  const reviewDecision = (status: "Approved" | "Rejected") => {
    if (!viewingOrganization) return
    setDecision({ org: viewingOrganization, status })
    setViewingOrganization(null)
  }
  const confirmDecision = async () => {
    if (!decision) return
    try {
      await api.updateOrganizationStatus(decision.org.id, decision.status)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Unable to update organization.",
      )
      return
    }
    updateStore((s) => ({
      ...s,
      organizations: s.organizations.map((o) =>
        o.id === decision.org.id ? { ...o, status: decision.status } : o,
      ),
    }))
    toast(
      `${decision.org.name} has been ${
        decision.status === "Rejected" ? "rejected" : "approved"
      }.`,
    )
    setDecision(null)
  }
  return (
    <div className="page">
      <button className="back-link" onClick={() => go("dashboard")}>
        <Icon name="back" size={17} /> Back to Admin Dashboard
      </button>
      <PageHead
        eyebrow="Account approvals"
        title="Pending organization requests"
        description={`${pending.length} ${
          pending.length === 1 ? "organization is" : "organizations are"
        } waiting for review.`}
      />
      <div className="table-tools pending-request-tools">
        <label className="search-box">
          <Icon name="search" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search organization, contact, email, or registration number"
            aria-label="Search pending organization requests"
          />
        </label>
        <span>
          {matchingPending.length} of {pending.length} requests
        </span>
      </div>
      <div className="request-list">
        {matchingPending.length ? (
          matchingPending.map((o) => (
            <article className="request-card" key={o.id}>
              <OrganizationAvatar organization={o} />
              <div>
                <div className="request-title">
                  <h2>{o.name}</h2>
                  <Badge tone="amber">Pending review</Badge>
                </div>
                <span className="org-email">{o.email}</span>
                <p>{o.description}</p>
                <small>Submitted for administrator review</small>
              </div>
              <div className="request-actions">
                <Button
                  variant="secondary"
                  onClick={() => setViewingOrganization(o)}
                >
                  <Icon name="eye" size={17} /> View
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDecision({ org: o, status: "Rejected" })}
                >
                  Reject
                </Button>
                <Button
                  icon="check"
                  onClick={() => setDecision({ org: o, status: "Approved" })}
                >
                  Approve
                </Button>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title={pending.length ? "No matching requests" : "All caught up"}
            text={
              pending.length
                ? "Try a different organization name, contact, email, or registration number."
                : "There are no organization requests waiting for review."
            }
            action={
              pending.length ? (
                <Button variant="secondary" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : (
                <Button onClick={() => go("dashboard")}>
                  Return to dashboard
                </Button>
              )
            }
          />
        )}
      </div>
      {viewingOrganization && (
        <Modal
          title={viewingOrganization.name}
          onClose={() => setViewingOrganization(null)}
          wide
        >
          <OrganizationReviewDetails
            organization={viewingOrganization}
            contactName={organizationContactName(store, viewingOrganization)}
          />
          <div className="modal-actions decision-actions">
            <Button
              variant="secondary"
              onClick={() => setViewingOrganization(null)}
            >
              Close
            </Button>
            <Button variant="danger" onClick={() => reviewDecision("Rejected")}>
              Reject
            </Button>
            <Button icon="check" onClick={() => reviewDecision("Approved")}>
              Approve
            </Button>
          </div>
        </Modal>
      )}
      {decision && (
        <Modal
          title={`${
            decision.status === "Approved" ? "Approve" : "Reject"
          } organization?`}
          onClose={() => setDecision(null)}
        >
          <p>
            This will mark <strong>{decision.org.name}</strong> as{" "}
            {decision.status.toLowerCase()} and remove it from the pending
            queue.
          </p>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              variant={decision.status === "Rejected" ? "danger" : "primary"}
              onClick={confirmDecision}
            >
              Confirm {decision.status.toLowerCase()}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Notifications({
  store,
  user,
  updateStore,
}: {
  store: Store
  user: User
  updateStore: (fn: (s: Store) => Store) => void
}) {
  const notifications = store.notifications.filter(
    (notification) => notification.orgId === user.orgId,
  )
  useEffect(() => {
    const unreadNotifications = notifications.filter(
      (notification) => !notification.read,
    )
    if (!unreadNotifications.length) return
    void Promise.all(
      unreadNotifications.map((notification) =>
        api.updateNotification(notification.id, true),
      ),
    )
      .then(() =>
        updateStore((s) => ({
          ...s,
          notifications: s.notifications.map((notification) =>
            notification.orgId === user.orgId
              ? { ...notification, read: true }
              : notification,
          ),
        })),
      )
      .catch((error) => {
        console.error("Unable to mark notifications as read.", error)
      })
  }, [])
  return (
    <div className="page">
      <PageHead
        eyebrow="Organization updates"
        title="Notifications"
        description="Application activity for your volunteer positions."
      />
      <div className="notification-list">
        {notifications.length ? (
          notifications.map((notification) => (
            <div key={notification.id} className="notification-item">
              <span>
                <Icon name="bell" />
              </span>
              <div>
                <strong>{notification.text}</strong>
                <small>{displayDate(notification.date)}</small>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="No notifications yet"
            text="New applicant activity will appear here when notifications are enabled."
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SECTION 9: SHARED DIALOGS, EMPTY STATES, AND FEEDBACK
// ============================================================================

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    addEventListener("keydown", close)
    return () => removeEventListener("keydown", close)
  }, [onClose])
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon name="search" size={28} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  )
}
function Toast({ message }: { message: string }) {
  return message ? (
    <div className="toast">
      <span>
        <Icon name="check" size={17} />
      </span>
      {message}
    </div>
  ) : null
}

export default App
