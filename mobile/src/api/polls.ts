import { api } from './client';
import type { Role } from '../auth/AuthContext';

export type PollStatus = 'draft' | 'open' | 'closed';

export interface PollOption {
  id: string;
  text: string;
}

export interface Poll {
  _id: string;
  buildingId: string;
  title: string;
  description: string;
  options: PollOption[];
  eligibleRoles: Role[];
  allowMultiple: boolean;
  anonymous: boolean;
  opensAt: string;
  closesAt: string;
  status: PollStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vote {
  _id: string;
  pollId: string;
  userId: string;
  unitId: string | null;
  optionIds: string[];
  castAt: string;
}

export interface PollDetail {
  poll: Poll;
  myVote: Vote | null;
  /** Present only once the poll is closed. */
  tallies?: Record<string, number>;
}

export async function listPolls(): Promise<Poll[]> {
  const r = await api.get<{ polls: Poll[] }>('/polls');
  return r.data.polls ?? [];
}

export async function getPoll(id: string): Promise<PollDetail> {
  const r = await api.get<PollDetail>(`/polls/${id}`);
  return r.data;
}

/** Admin/owner only. */
export async function createPoll(body: {
  title: string;
  description?: string;
  options: { text: string }[];
  eligibleRoles?: Role[];
  allowMultiple?: boolean;
  anonymous?: boolean;
  opensAt?: string;
  closesAt: string;
}): Promise<Poll> {
  const r = await api.post<{ poll: Poll }>('/polls', body);
  return r.data.poll;
}

export async function votePoll(id: string, optionIds: string[]): Promise<void> {
  await api.post(`/polls/${id}/vote`, { optionIds });
}

/** Admin only. */
export async function closePoll(id: string): Promise<Poll> {
  const r = await api.post<{ poll: Poll }>(`/polls/${id}/close`, {});
  return r.data.poll;
}
