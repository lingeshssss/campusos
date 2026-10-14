import {getChatGPTUser} from '../../chatgpt-auth';
import {getDb} from '../../../db';
import {studentStates} from '../../../db/schema';
import {eq} from 'drizzle-orm';
import {stateSchema} from '../../../lib/model';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in first.'},{status:401});try{const [row]=await getDb().select().from(studentStates).where(eq(studentStates.userId,user.userId));const state=stateSchema.parse(row?JSON.parse(row.payload):{profile:null,courses:[]});return new Response(JSON.stringify({format:'campusos-student-data',schemaVersion:7,exportedAt:new Date().toISOString(),state},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="campusos-data.json"','Cache-Control':'no-store'}});}catch{return Response.json({error:'Could not export data. Please retry.'},{status:503});}}
