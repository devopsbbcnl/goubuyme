import { Server } from 'socket.io';

let io: Server;

export const setIO = (instance: Server) => { io = instance; };
export const getIO = (): Server => io;
