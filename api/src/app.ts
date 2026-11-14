import express from 'express';
import {responseValidation} from './contracts/validation.js';
import helmet from 'helmet';
import cors from 'cors';
import {routes} from './routes/index.js';
import {ApiError} from './services/errors.js';
import {Store} from './db/store.js';
import {CachedAiClient,type AiClient} from './ai/aiClient.js';
import {Jobs} from './services/jobs.js';
import {CosineNeighborFinder,type NeighborFinder} from './services/neighbors.js';
export function createApp(store:Store,client:AiClient,options:{enableSeed?:boolean;origin?:string;finder?:NeighborFinder}={}){const app=express();app.disable('x-powered-by');app.use(helmet());if(options.origin)app.use(cors({origin:options.origin}));app.use(responseValidation);app.use(express.json({limit:'3mb'}));const jobs=new Jobs(store);const ai=new CachedAiClient(client,store);app.get('/healthz',(_req,res)=>res.json({ok:true}));app.get('/readyz',(_req,res,next)=>{store.db.command({ping:1}).then(()=>res.json({ok:true})).catch(next);});app.use('/api',routes(store,ai,jobs,options.finder??new CosineNeighborFinder(),options.enableSeed));app.use((_req,_res,next)=>next(new ApiError('not_found','Route not found')));app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const e=err instanceof ApiError?err:err.type==='entity.parse.failed'?new ApiError('bad_request','Malformed JSON'):err instanceof SyntaxError||err.name==='MulterError'?new ApiError('bad_request',err.message):new ApiError('internal','An unexpected error occurred');if(e.code==='internal')console.error(err);res.status(e.status).json({error:{code:e.code,message:e.message}});});return {app,jobs};}
