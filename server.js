const http = require('http');
const Koa = require('koa');
const koaBody = require('koa-body');
const app = new Koa();
const path = require('path');
const fs = require('fs');

app.use(koaBody({
    text: true,
    urlencoded: true,
    multipart: true,
    json: true
}));

const WS = require('ws');
const { errorMonitor } = require('events');
const port = process.env.PORT 
const server = http.createServer(app.callback());
const wsServer = new WS.Server({server});
const onlineClients = new Map();

wsServer.on('connection', (ws, req) => {
    app.use(async(ctx, next) => {
        const origin = ctx.request.get('Origin');
        if(!origin) {
            return await next();
        }
        
        const headers = {'Access-Control-Allow-Origin': '*'}
        
        if(ctx.request.method !== 'OPTIONS') {
            ctx.response.set({...headers});
            try {
                return await next();
            }catch(e) {
                e.headers = {...e.headers,...headers};
                throw e;
            }
        }
        
        if(ctx.request.get('Access-Control-Request-Method')) {
            ctx.response.set({...headers,'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, PATCH'
        });
            
        if(ctx.request.get('Access-Control-Request-Headers')) {
            ctx.response.set('Access-Control-Allow-Headers', ctx.request.get('Access-Control-Allow-Request-Headers'));
        }
            
        ctx.response.status = 204;
        }
    });    
    
    
    ws.onclose = () =>  {
        const oflineClientName = onlineClients.get(ws);
        const oflineClientObj = {
            name: oflineClientName,
            type: 'delete'
        }
        
        
        Array.from(wsServer.clients)
            .filter(o => o.readyState === WS.OPEN)
            .forEach(o => o.send(JSON.stringify(oflineClientObj)));
       
        onlineClients.delete(ws);
    }
    
    ws.on('message', msg => {
        const {type} = JSON.parse(msg)

        switch(type) {
            case 'text': 
                fs.readFile(path.join(__dirname, 'public', 'messages.json'), (err, data) => {
                    if (err) {
                        console.error(err)
                        return
                    }
                    
                    if(!data.length) { 
                        data = [JSON.parse(msg)]
                    }  else {
                        data = JSON.parse(data);
                        data.push(JSON.parse(msg));

                    }  
                       
                    fs.writeFile(path.join(__dirname, 'public', 'messages.json'), JSON.stringify(data), (err) => {
                        if (err) {
                            console.error(err);
                            return;
                        }
                    });
                    Array.from(wsServer.clients)
                        .filter(o => o.readyState === WS.OPEN)
                        .forEach(o => o.send(msg));
                });
                break

            case 'redraw': 
                const clientsLoginsList = [];
                if(onlineClients.size) {
                    for(const login of onlineClients.values()) {
                        clientsLoginsList.push(login)
                    }
                }
            
                fs.readFile(path.join(__dirname, 'public', 'messages.json'), (err, data) => {
                    if (err) {
                        console.error(err)
                        return
                    }

                    if(data.length) {
                        data = JSON.parse(data);
                        const arrMessages = {
                            type: 'redraw',
                            messages: data,
                            logins: clientsLoginsList
                        }
                        ws.send(JSON.stringify(arrMessages));
                    }
                });
                break
                
            case 'login': 
                const validateLogin = (newLogin, loginsArr) => {
                    const error = {};
                    error.type = 'error';
                    if(!newLogin) {
                        error.message = 'Введите псевдоним, поле не должно быть пустым'
                        return error
                    }
                
                    let loginIsFinded = null;
                    for(const login of loginsArr) {
                        if(login == newLogin) {
                            loginIsFinded = login;
                            break;
                        }
                    }
                    if(loginIsFinded) {
                        error.message = `Псевдоним ${loginIsFinded} занят, введите другой`;
                        return error
                    }
                }
                
                const {name} = JSON.parse(msg);
               
                if(onlineClients.size) {
                    const clientsArr = onlineClients.values();
                    const errorFinded = validateLogin(name, clientsArr);
                    if(errorFinded) {
                        return ws.send(JSON.stringify(errorFinded));
                    } else {
                        onlineClients.set(ws, name);
                        Array.from(wsServer.clients)
                            .filter(o => o.readyState === WS.OPEN)
                            .forEach(o => o.send(msg));
                    }
                } else {
                    onlineClients.set(ws, name);
                    Array.from(wsServer.clients)
                        .filter(o => o.readyState === WS.OPEN)
                        .forEach(o => o.send(msg));
                }
                break;
        }      
    });
});

app.use(async(ctx, next) => {
    ctx.response.set({'Access-Control-Allow-Origin':'*'});
    return await next();
});

server.listen(port);

