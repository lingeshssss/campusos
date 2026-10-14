import { getChatGPTUser } from '../../chatgpt-auth';
import { normalizeIsbn,validIsbn } from '../../../lib/textbooks';
export async function GET(request:Request){
 if(!await getChatGPTUser())return Response.json({error:'Sign in first.'},{status:401});
 const isbn=normalizeIsbn(new URL(request.url).searchParams.get('isbn')||'');
 if(!validIsbn(isbn))return Response.json({error:'Enter a valid ISBN-10 or ISBN-13.'},{status:400});
 try {const res=await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'CampusOS/1.0 (student textbook ISBN lookup)'}});
 if(!res.ok)throw Error();const data=await res.json() as Record<string,{title?:string;authors?:{name:string}[]}>;const book=data[`ISBN:${isbn}`];
 if(!book?.title)return Response.json({error:'No catalog match. Enter the title, author and edition manually.'},{status:404});
 return Response.json({title:book.title.slice(0,300),author:(book.authors||[]).map(a=>a.name).join(', ').slice(0,250),isbn,source:'Open Library',sourceUrl:`https://openlibrary.org/isbn/${isbn}`},{headers:{'Cache-Control':'private, max-age=3600'}});
 }catch{return Response.json({error:'ISBN lookup is unavailable. You can still enter all book details manually.'},{status:503});}
}
