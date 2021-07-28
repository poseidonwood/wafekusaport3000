const { ClientInfo, Client, MessageMedia } = require('whatsapp-web.js');
const morgan = require('morgan')
require('log-timestamp');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const port = process.env.PORT || 8000;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
let start = new Date();
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: true
}));

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
  },
  session: sessionCfg
});
const clientinfo = new ClientInfo();


client.on('message', msg => {
  let end = new Date()-start;
  const responsenya = '*Bot Online* \n*Response time = ' + end + ' ms*';
  const help = 'List menu\n1. p = Untuk cek koneksi dan response\n2. battery = Untuk cek info battery\n3. groups = untuk cek Id group\n\nFitur lain menyusul';
  if (msg.body == 'p') {
    msg.reply(responsenya);
    console.log('Send message : ' + responsenya); 
  } else if (msg.body == 'battery') {
	//get  battery info
	client.info.getBatteryStatus().then((number) => {
		const obj = JSON.parse(JSON.stringify(number));
		var mengisi;
		if (obj.plugged === true) {
		mengisi = "Sedang dicharge";
		} else {
		mengisi = "Tidak dicharge";
		}
		const batterinfolog = "*Battery Level : "+obj.battery+"%*, "+mengisi;
        console.log(batterinfolog);
		msg.reply(batterinfolog);
    });
  } else if (msg.body == 'groups') {
    client.getChats().then(chats => {
      const groups = chats.filter(chat => chat.isGroup);
      if (groups.length == 0) {
        msg.reply('You have no group yet.');
      } else {
        let replyMsg = '*YOUR GROUPS*\n\n';
        groups.forEach((group, i) => {
          replyMsg += `ID: ${group.id._serialized}\nName: ${group.name}\n\n`;
        });
        replyMsg += '_You can use the group id to send a message to the group._'
        msg.reply(replyMsg);
      }
    });
  } else if (msg.body == 'help'){
	msg.reply(help);
    console.log('Send message : ' + help);
  } else if (msg.body == 'info'){
  	let contact= msg.from;
  	let contactnya = contact.replace('@c.us','');
  	let url = "https://unilearning.skmi.site/cronjob/getinfo/"+contactnya;
	https.get(url,(res) => {
	    let body = "";

	    res.on("data", (chunk) => {
		body += chunk;
	    });

	    res.on("end", () => {
		try {
		    let json = JSON.parse(body);
		    // do something with JSON
		    console.log(json.message);
		    msg.reply(json.message);
		} catch (error) {
		    console.error(error.message);
		};
	    });

	}).on("error", (error) => {
	    console.error(error.message);
	});
	
  } else if (msg.body == 'mypiagam'){
  	let contact= msg.from;
  	let contactnya = contact.replace('@c.us','');
  	let url = "https://unilearning.skmi.site/cronjob/getpiagam/"+contactnya;
	https.get(url,(res) => {
	    let body = "";

	    res.on("data", (chunk) => {
		body += chunk;
	    });

	    res.on("end", () => {
		try {
		    const json = JSON.parse(body);
		    // do something with JSON
		    //for(var i = 0; i < json.message.length; i++){
		    //const obj = json.message[i];
		    //console.log(obj.caption+" - "+obj.file);
		    //Send Media 
		    //const filenya = obj.caption +" : ["+obj.file+"]";
		    const filenya = json.message;
		    msg.reply(filenya);       
		    //End Send Media
		} catch (error) {
		    console.error(error.message);
		};
	    });

	}).on("error", (error) => {
	    console.error(error.message);
	});
	
  } else if (msg.body === 'device'){
  	let info = client.info;
        client.sendMessage(msg.from, `
            *Connection info*
            User name: ${info.pushname}
            My number: ${info.me.user}
            Platform: ${info.platform}
            WhatsApp version: ${info.phone.wa_version}
            Device Model: ${info.phone.device_model}
        `);
  }
  
});

client.initialize();

// Socket IO
io.on('connection', function(socket) {
  socket.emit('message', 'Connecting...');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });

  client.on('authenticated', (session) => {
    socket.emit('authenticated', 'Whatsapp is authenticated!');
    socket.emit('message', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED', session);
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function(err) {
      if (err) {
        console.error(err);
      }
    });
  });

  client.on('auth_failure', function(session) {
    socket.emit('message', 'Auth failure, restarting...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp is disconnected!');
    fs.unlinkSync(SESSION_FILE_PATH, function(err) {
        if(err) return console.log(err);
        console.log('Session file deleted!');
    });
    client.destroy();
    client.initialize();
  });
});


const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

// Send message
app.post('/send-message', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Send media
app.post('/send-media', async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file;

  // const media = MessageMedia.fromFilePath('./image-example.png');
  // const file = req.files.file;
  // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  let mimetype;
  const attachment = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  }).then(response => {
    mimetype = response.headers['content-type'];
    return response.data.toString('base64');
  });

  const media = new MessageMedia(mimetype, attachment, caption);

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Send message to group
// -- Send message !groups to get all groups (id & name)
// -- So you can use that group id to send a message
app.post('/send-group-message', [
  body('id').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const chatId = req.body.id;
  const message = req.body.message;

  client.sendMessage(chatId, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});
// Send media
app.post('/send-media-group', async (req, res) => {
  const number = (req.body.id);
  const caption = req.body.caption;
  const fileUrl = req.body.file;

  // const media = MessageMedia.fromFilePath('./image-example.png');
  // const file = req.files.file;
  // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  let mimetype;
  const attachment = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  }).then(response => {
    mimetype = response.headers['content-type'];
    return response.data.toString('base64');
  });

  const media = new MessageMedia(mimetype, attachment, 'Media');

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

server.listen(port, function() {
  console.log('App running on *: ' + port);
});
