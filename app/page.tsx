import CampusApp from './campus-app';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() { const user = await requireChatGPTUser('/'); return <CampusApp displayName={user.fullName?.split(' ')[0] ?? ''}/>; }
