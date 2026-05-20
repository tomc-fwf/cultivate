import { z } from 'zod';

export const UsersQuerySchema = z.object({}).strict();
export type UsersQuery = z.infer<typeof UsersQuerySchema>;

export const UserListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  role: z.string(),
});
export type UserListItem = z.infer<typeof UserListItemSchema>;

export const LoginBodySchema = z.object({
  user_id: z.coerce.number(),
  pin: z.string().min(4).max(8),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  worker: z.object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
