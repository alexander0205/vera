import { exigirAdmin } from '@/lib/auth/admin-guard';
import ChatsClient from './_chats-client';

export default async function AdminWhatsAppChatsPage() {
  await exigirAdmin();   // ver lib/auth/admin-guard.ts
  return <ChatsClient />;
}
