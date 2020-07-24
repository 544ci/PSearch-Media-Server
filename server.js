const NodeMediaServer = require('node-media-server');
const sql = require('mssql')
const moment = require('moment');
var randomstring = require("randomstring");
const path = require('path');
const fs = require('fs');

var ffmpeg = require('fluent-ffmpeg');
var express = require('express');
var app = express();


const conf = {
  user:'saad',
  password:"3cfe170c",
  server: 'localhost',
  driver: 'tedious',
  options:{
    enableArithAbort:false
  },
  database: 'PSearch'
};
connect()


//doneStream("481f7d4f8e29b304")
const config = {
   
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: './live',
    allow_origin: '*'
  },
  trans: {
    ffmpeg: './ffmpeg.exe',
    tasks: [
      {
        app: 'live',
        mp4: true,
        mp4Flags: '[movflags=faststart]',
      }
    ]
  }
};
 
var nms = new NodeMediaServer(config)

nms.on('postPublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    let phoneId = StreamPath.split("/")[2]
    streamReady(phoneId);
});


nms.on('donePublish', async (id, StreamPath, args) => {
    console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    let phoneId = StreamPath.split("/")[2]
    const result = await sql.query`select * from Video where PhoneRefId like ${phoneId} and Saved = 0`
    let f = getLatestFile(`live/live/${phoneId}`);
    doneStream(phoneId)
    console.log(result)
    for (var i in result.recordset) {
        cutVideo(`live/live/${phoneId}/${f}`, `videos/${result.recordset[i].Id}.mp4`, result.recordset[i].Start, result.recordset[i].End)
        await sql.query`UPDATE [dbo].[Video] SET [Saved] = 1 WHERE [id] = ${result.recordset[i].Id} `
    }
    
    //fs.unlinkSync(`live/live/${phoneId}/` + f);
});

nms.on('postPlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});
 
nms.on('donePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    let phoneId = StreamPath.split("/")[2]
});



async function doneStream (id) {
    try {
      const result = await sql.query`select * from Request where PhoneRefId= ${id} and RequestId=6`
      if(result.rowsAffected[0]==0){
        await sql.query`INSERT INTO Request ([RequestId],[PhoneRefId] ,[Status] ,[LastModified]) VALUES (6,${id} ,5 ,${moment().toISOString(true)}) `
      }
      else{
          await sql.query`UPDATE [dbo].[Request] SET [Status] = 5 ,[LastModified] = ${moment().toISOString(true)} WHERE [PhoneRefId] = ${id} AND [RequestId] = 6 `
      }
      console.log(result.rowsAffected)
    } catch (err) {
      console.log(err)

    }
}

async function streamReady (id) {
  try {
    console.log("publishing")
    const result = await sql.query`select * from Request where PhoneRefId= ${id} and RequestId=6`
    if(result.rowsAffected[0]==0){
      await sql.query`INSERT INTO Request ([RequestId],[PhoneRefId] ,[Status] ,[LastModified]) VALUES (6,${id} ,3 ,${moment().toISOString(true)}) `
    }
    else{
      await sql.query`UPDATE [dbo].[Request] SET [Status] = 3 ,[LastModified] = ${moment().toISOString(true)} WHERE [PhoneRefId] = ${id} AND [RequestId] = 6 `
    }
  } catch (err) {
    console.log(err)

  }
}


function cutVideo(orignalVid, newVid, start, end) {
    console.log(orignalVid)
    console.log(newVid)
    console.log(start)
    console.log(end)

    const newVidStart = moment(start).utc();
    const newVidEnd = moment(end).utc();
    const duration = moment(newVidEnd.diff(newVidStart)).utc().seconds()

    console.log(newVidStart.format('HH:mm:ss'))
    console.log(duration)
    ffmpeg(orignalVid)
        .setStartTime(newVidStart.format('HH:mm:ss'))
        .setDuration(duration)
        .output(newVid)
        .on('end', function (err) {
            if (!err) {
                console.log('conversion Done');
            }

        })
        .on('error', function (err) {
            console.log('error: ', +err);

        }).run();


}
        
        
    

        

async function connect(){
    await sql.connect(conf)


}


function getLatestFile(dir) {
    let latestFile;
    let latestTime;
    let files = fs.readdirSync(dir);
    if (files.length != 0) {
        latestTime = fs.statSync(dir + '/' + files[0]).ctime
        latestFile=files[0]
    }
    files.forEach(function (file) {
        let createdTime = fs.statSync(dir + '/' + file).ctime;
        if (createdTime > latestTime) {
            latestFile = file;
            latestTime = createdTime
        }
    });
    return latestFile;
}
nms.run();


app.use('/videos', express.static(__dirname + '/videos'));


var server = app.listen(5000);

