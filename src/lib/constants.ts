export const ROOM_CHANNEL = "room:daget";
export const CHANNEL_NAME = "daget";
export const MEDIA_BUCKET = "chat-media";

export const PAGE_SIZE = 50;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const ALLOWED_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 24;
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*$/;

/** Consecutive messages from the same author within this window are grouped. */
export const GROUP_WINDOW_MS = 7 * 60 * 1000;
export const TYPING_THROTTLE_MS = 2500;
export const TYPING_TTL_MS = 4500;
export const HEARTBEAT_MS = 2 * 60 * 1000;
