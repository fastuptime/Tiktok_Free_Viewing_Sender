const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const ejs = require('ejs');
const app = express();
const cookieParser = require('cookie-parser');
const { JsonDatabase } = require('wio.db');
const db = new JsonDatabase({ databasePath: './db.json' });
const axios = require('axios');

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', __dirname);

app.use((req, res, next) => {
    if (!req.cookies.userID) {
        let userID = 'user_' + Math.random().toString(36).substring(2, 15);
        res.cookie('userID', userID, { maxAge: 900000, httpOnly: true });
        db.set(userID, { coin: 0, logs: [], getCoins: [] });
    } else {
        if (!db.has(req.cookies.userID)) {
            db.set(req.cookies.userID, { coin: 0, logs: [], getCoins: [] });
        }
    }
    res.locals.adsCoin = config.adsCoin;
    res.locals.buyCoin = config.buyCoin;
    res.locals.sendCount = config.sendCount;
    next();
});

app.get('/', (req, res) => {
    let user = db.has(req.cookies.userID) ? db.fetch(req.cookies.userID) : null;
    if (!user) return res.send('<script>alert("Hesabınız oluşturuluyor lütfen bekleyiniz.");window.location.href="/";</script>');
    res.render('index.ejs', {
        user
    });
});

app.get('/getcoins', async (req, res) => {
    let user = db.fetch(req.cookies.userID);
    if (!user) return res.json({ error: true, message: 'Hesabınız bulunamadı.' });
    let code = 'code_' + Math.random().toString(36).substring(2, 15);
    db.push(req.cookies.userID + '.getCoins', { code: code });
    let r = await axios.get(`https://ay.live/api/?api=${config.apiKey}&url=${config.url}?code=${code}&ct=1`).catch(err => { return res.json({ error: true, message: 'Bir hata oluştu.' }); });
    r = r.data;
    if (r.status == 'success') return res.redirect(r.shortenedUrl);
    return res.json({ error: true, message: 'Bir hata oluştu.' });
});

app.get('/callback', (req, res) => {
    let code = req.query.code;
    if (!code) return res.json({ error: true, message: 'Bir hata oluştu. 1' });
    let user = db.fetch(req.cookies.userID);
    if (!user) return res.json({ error: true, message: 'Hesabınız bulunamadı.' });
    let getCoins = db.fetch(req.cookies.userID + '.getCoins');
    let find = getCoins.find(x => x.code == code);
    if (!find) return res.json({ error: true, message: 'Bir hata oluştu. 3' });
    db.add(req.cookies.userID + '.coin', config.adsCoin);
    db.push(req.cookies.userID + '.logs', { type: 'getCoin', coin: config.adsCoin, date: new Date() });
    db.set(req.cookies.userID + '.getCoins', getCoins.filter(x => x.code != code));
    return res.redirect(`/?success=true&message=Hesabınıza ${config.adsCoin} coin eklendi.`);
});

app.post('/send', async (req, res) => {
    let user = db.fetch(req.cookies.userID);
    if (!user) return res.json({ error: true, message: 'Hesabınız bulunamadı.' });
    let url = req.body.videourl;
    if (!url) return res.redirect(`/?error=true&message=Video urlsi giriniz.`);
    if (!url.includes('tiktok.com')) return res.redirect(`/?error=true&message=Geçersiz video urlsi.`);
    if (user.coin < config.buyCoin) return res.redirect(`/?error=true&message=Hesabınızda yeterli coin bulunmuyor.`);
    axios('https://igresellers.com/api/v2', {
        method: 'POST',
        data: {
            key: config.smmApiKey,
            action: 'add',
            service: config.serviceID,
            link: url,
            quantity: config.sendCount
        }
    }).then(async r => {
        r = r.data;
        db.set(req.cookies.userID + '.coin', user.coin - config.buyCoin);
        db.push(req.cookies.userID + '.logs', { type: 'send', coin: config.buyCoin, date: new Date(), order: r.order });
        return res.redirect(`/?success=true&message=İşlem başarılı. İzlenme gönderiliyor sipariş numaranız: ${r.order}`);
    }).catch(err => {
        return res.redirect(`/?error=true&message=İşlem başarısız. ${err.response.data.message}`);
    });
});


app.listen(config.port, () => {
    console.log(`İzlenme gönderme uygulaması ${config.port} portunda çalışıyor.`);
});
