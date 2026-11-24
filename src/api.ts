const API_ROOT = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
)

export type ApiRole = "volunteer" | "organization" | "admin"
export type ApiUser = {
  uid: string
  uname: string
  email: string
  role: ApiRole
}
export type CreateUserPayload = {
  uname: string
  email: string
  password: string
  role: ApiRole
}
export type ApiOrganization = {
  oid: string
  oname: string
  email: string
  description: string
  logoUrl?: string | null
  logo_url?: string | null
  website?: string | null
  charitableRegistrationNumber?: string | null
  charitable_registration_number?: string | null
  missionStatement?: string | null
  mission_statement?: string | null
  status: "Approved" | "Pending" | "Rejected"
  notify: boolean
}
export type ApiPosition = {
  pid: string
  title: string
  oid: string
  location: string
  distance: number
  date: string
  time_range: string
  commitment: "Weekly" | "Flexible" | "One-time"
  spots: number
  description: string
  responsibilities: string[]
  requirements: string[]
  status: "Active" | "Paused"
  notify: boolean
  contact_email: string
  contact_phone: string
  oname?: string
}
export type ApiApplication = {
  aid: string
  pid: string
  volunteer_id: string
  name: string
  email: string
  message: string
  date: string
  status: "New" | "Under Review" | "Contacted" | "Accepted" | "Rejected"
  phone?: string
  skills?: string
  availability?: string
  resumeName?: string
  resume_name?: string
  resumeDataUrl?: string
  resume_data_url?: string
  resumeText?: string
  resume_text?: string
}
export type ApiNotification = {
  nid: string
  oid: string
  text: string
  date: string
  is_read: boolean
}
export type ApiPositionRelationship = {
  uid: string
  pid: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

const request = async <T,>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  const body = (await response.json().catch(() => null)) as {
    error?: string
  } & Record<string, unknown> | null

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error || `API request failed with status ${response.status}.`,
    )
  }

  return body as T
}

const json = (method: "POST" | "PATCH", body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
})

export const api = {
  resetDemoData: () => request<void>("/reset-demo-data", { method: "POST" }),
  createUser: (body: CreateUserPayload) =>
    request<ApiUser>("/users", json("POST", body)),
  getUser: (userId: string) => request<ApiUser>(`/users/${userId}`),
  getUsers: () => request<ApiUser[]>("/users"),
  login: (identifier: string, password: string) =>
    request<ApiUser>("/login", json("POST", { identifier, password })),

  createOrganization: (body: ApiOrganization) =>
    request<ApiOrganization>("/organizations", json("POST", body)),
  getOrganization: (organizationId: string) =>
    request<ApiOrganization>(`/organizations/${organizationId}`),
  getOrganizations: () => request<ApiOrganization[]>("/organizations"),
  deleteOrganization: (organizationId: string) =>
    request<ApiOrganization>(`/organizations/${organizationId}`, {
      method: "DELETE",
    }),
  updateOrganizationStatus: (organizationId: string, status: string) =>
    request<ApiOrganization>(
      `/organizations/${organizationId}/status`,
      json("PATCH", { status }),
    ),
  updateOrganizationNotifications: (organizationId: string, enabled: boolean) =>
    request<ApiOrganization>(
      `/organizations/${organizationId}/notifications`,
      json("PATCH", { enabled }),
    ),

  createPosition: (body: ApiPosition) =>
    request<ApiPosition>("/positions", json("POST", body)),
  getPositions: () => request<ApiPosition[]>("/active-positions"),
  getAllPositions: () => request<ApiPosition[]>("/all-positions"),
  getOrganizationPositions: (organizationId: string) =>
    request<ApiPosition[]>(`/organizations/${organizationId}/positions`),
  updatePosition: (
    positionId: string,
    body: Partial<Omit<ApiPosition, "pid" | "oid">>,
  ) => request<ApiPosition>(`/positions/${positionId}`, json("PATCH", body)),
  deletePosition: (positionId: string) =>
    request<ApiPosition>(`/positions/${positionId}`, { method: "DELETE" }),

  createApplication: (body: ApiApplication) =>
    request<ApiApplication>("/applications", json("POST", body)),
  getAllApplications: () => request<ApiApplication[]>("/all-applications"),
  getOrganizationApplications: (organizationId: string) =>
    request<ApiApplication[]>(`/organizations/${organizationId}/applications`),
  getUserApplications: (userId: string) =>
    request<ApiApplication[]>(`/users/${userId}/applications`),
  updateApplication: (applicationId: string, status: string) =>
    request<ApiApplication>(
      `/applications/${applicationId}`,
      json("PATCH", { status }),
    ),

  createNotification: (body: ApiNotification) =>
    request<ApiNotification>("/notifications", json("POST", body)),
  getNotifications: (organizationId: string) =>
    request<ApiNotification[]>(
      `/organizations/${organizationId}/notifications`,
    ),
  updateNotification: (notificationId: string, isRead: boolean) =>
    request<ApiNotification>(
      `/notifications/${notificationId}`,
      json("PATCH", { is_read: isRead }),
    ),

  savePosition: (userId: string, positionId: string) =>
    request<ApiPositionRelationship[]>(
      `/users/${userId}/save-saved-positions/${positionId}`,
      json("POST", {}),
    ),
  getSavedPositions: (userId: string) =>
    request<ApiPositionRelationship[]>(`/get-saved-positions/${userId}/`),
  unsavePosition: (userId: string, positionId: string) =>
    request<ApiPositionRelationship[]>(
      `/users/${userId}/unsave-saved-position/${positionId}`,
      { method: "DELETE" },
    ),

  saveAppliedPosition: (userId: string, positionId: string) =>
    request<ApiPositionRelationship[]>(
      `/users/${userId}/save-applied-positions/${positionId}`,
      json("POST", {}),
    ),
  getAppliedPositions: (userId: string) =>
    request<ApiPositionRelationship[]>(`/get-applied-positions/${userId}/`),
}
