export interface ApiModel {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  format: string;
  tags: string[];
  coverImageUrl: string | null;
  downloadCount: number;
  username: string;
  displayName: string;
}

export interface ApiModelDetail extends ApiModel {
  architecture: string | null;
  parameterCount: number | null;
  baseModel: string | null;
  quantization: string | null;
  license: string;
  readmeContent: string;
  latestVersion: {
    id: string;
    version: string;
    fileSizeBytes: number;
    format: string;
    changelog: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: "USER" | "CREATOR" | "ADMIN";
  bio?: string;
  avatarUrl?: string | null;
  creator?: { id: string; stripeOnboarded: boolean } | null;
}

export interface ApiAuthResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
}

export interface ApiLicense {
  id: string;
  status: "ACTIVE" | "REVOKED" | "REFUNDED";
  createdAt: string;
  model: {
    id: string;
    slug: string;
    name: string;
    format: string;
    coverImageUrl: string | null;
    username: string;
    displayName: string;
  };
  seedStats: {
    bytesUploaded: number;
    fileSizeBytes: number;
    ratio: number;
    seedingSeconds: number;
  } | null;
}

export interface ApiCheckoutResult {
  free: boolean;
  checkoutUrl?: string;
  paymentId: string;
  licenseId?: string;
  modelId: string;
  modelName: string;
}

export interface ApiModelListResponse {
  models: ApiModel[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiUserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  createdAt: string;
  models: ApiModel[];
}
