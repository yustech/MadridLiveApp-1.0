import { useState } from 'react';
import type { StaffMember } from '../types';
import {
  getStaffAvatarColor,
  getStaffAvatarSource,
  getStaffAvatarTextColor,
  getStaffInitials,
} from '../utils/staffAvatar';

type StaffAvatarWorker = Pick<StaffMember, 'avatar' | 'idCode' | 'name'>;

interface StaffAvatarProps {
  worker: StaffAvatarWorker;
  className?: string;
  alt?: string;
  testId?: string;
}

export default function StaffAvatar({
  worker,
  className = '',
  alt,
  testId,
}: StaffAvatarProps) {
  const avatarSource = getStaffAvatarSource(worker.avatar);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showCustomAvatar = avatarSource !== null && failedSource !== avatarSource;

  if (showCustomAvatar) {
    return (
      <img
        src={avatarSource}
        alt={alt ?? worker.name}
        referrerPolicy="no-referrer"
        className={className}
        data-avatar-kind="custom"
        data-testid={testId}
        onError={() => setFailedSource(avatarSource)}
      />
    );
  }

  const backgroundColor = getStaffAvatarColor(worker.idCode);
  const initials = getStaffInitials(worker.name);
  const accessibleLabel = alt === '' ? undefined : (alt ?? `Avatar de ${worker.name}: ${initials}`);

  return (
    <span
      className={`inline-flex select-none items-center justify-center font-bold uppercase leading-none ${className}`}
      style={{ backgroundColor, color: getStaffAvatarTextColor(backgroundColor) }}
      aria-hidden={alt === '' ? true : undefined}
      aria-label={accessibleLabel}
      role={accessibleLabel ? 'img' : undefined}
      data-avatar-kind="initials"
      data-testid={testId}
    >
      {initials}
    </span>
  );
}
