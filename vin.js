
const puppeteer = require('puppeteer')
const cheerio = require('cheerio');

const preparePageForTests = async (page) => {
    // Pass the User-Agent Test.
    const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';
    await page.setUserAgent(userAgent);

    // Pass the Webdriver Test.
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    // Pass the Chrome Test.
    await page.evaluateOnNewDocument(() => {
        // We can mock this in as much depth as we need for the test.
        window.navigator.chrome = {
            runtime: {},
            // etc.
        };
    });

    // Pass the Permissions Test.
    await page.evaluateOnNewDocument(() => {
        const originalQuery = window.navigator.permissions.query;
        return window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    });

    // Pass the Plugins Length Test.
    await page.evaluateOnNewDocument(() => {
        // Overwrite the `plugins` property to use a custom getter.
        Object.defineProperty(navigator, 'plugins', {
            // This just needs to have `length > 0` for the current test,
            // but we could mock the plugins too if necessary.
            get: () => [1, 2, 3, 4, 5],
        });
    });

    // Pass the Languages Test.
    await page.evaluateOnNewDocument(() => {
        // Overwrite the `plugins` property to use a custom getter.
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });
    });
}

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    // проверка наличия вина
    if(!process.argv[2] || process.argv[2] === ''){
        return console.log(JSON.stringify({error:'Не указан VIN!'}));
    }
    // проверка на заполнение типа информации - dtp/reg/ogr/roz
    if(process.argv[3] !== 'dtp' && process.argv[3] !== 'reg' && process.argv[3] !== 'ogr' && process.argv[3] !== 'roz'){
        return console.log(JSON.stringify({error:'Не указан тип необходимой информации!'}));
    }
    // создаем объект для дальнейшей записи в него
    let returnObject = { vehicle: {}, ownershipPeriods: [] }, id
    // подготавливаем страницу
    const browser = await puppeteer.launch({
        args: ['--no-sandbox'],
        headless: true,
    });
    const page = await browser.newPage();
    await preparePageForTests(page);
    // создаем вид нахождения на сайте
    await page.goto('https://xn--90adear.xn--p1ai/');
    await sleep(1000)
    await page.click('.bs-holder2 ul li:first-child a');
    await page.goto('https://xn--90adear.xn--p1ai/check/fines');
    await sleep(1000)
    await page.click('.bs-holder2 ul li:nth-child(2) a');
    await page.goto('https://xn--90adear.xn--p1ai/check/auto');
    await sleep(4000)
    // вводим ВИН по символу имитируя пользователя
    let vin = process.argv[2]
    for (n = 0; n < vin.length; n++) {
        await sleep(200);
        await page.type('#checkAutoVIN', vin[n]);
    }
    // в зависимоти от нужного типа инфы указываем айдишник
    if(process.argv[3]==='reg')id='checkAutoHistory'
    if(process.argv[3]==='dtp')id='checkAutoAiusdtp'
    if(process.argv[3]==='ogr')id='checkAutoRestricted'
    if(process.argv[3]==='roz')id='checkAutoWanted'
    // кликаем по кнопке запросить ИСТОРИЮ РЕГИСТРАЦИИ
    await page.click('#'+id+' a');
    // ждем что выдаст сервер
    let i = 0
    while (i <= 60) {
        let html = await page.$eval('#'+id+'', e => e.innerHTML);
        if (html.indexOf('Выполняется запрос, ждите') + 1 && !html.indexOf('<ul class="fields-list">') + 1) {
            //console.log('Ожидание')
        } else {
            i = 65
        }
        await sleep(2000);
        i++
    }
    // ошибка если так и не загрузилось
    if(i <= 64){
        return console.log(JSON.stringify({error:'Слишком долгое время ожидания с сайта ГИБДД!'}));
    }
    // получаем содержимое html блока истории регистрации авто
    let checkAutoHistory = await page.$eval('#'+id+'', e => e.innerHTML);
    // парсим дом
    checkAutoHistory = cheerio.load(checkAutoHistory);
    // проходим по свойствам авто
    checkAutoHistory('ul.fields-list li').each(function (i, elem) {
        returnObject.vehicle[checkAutoHistory(this).children().first().text().replace(':', '')] = checkAutoHistory(this).children().last().text()
    });
    // проходим по истории регистрации
    checkAutoHistory('ul.ownershipPeriods li').each(function (i, elem) {
        returnObject.ownershipPeriods.push({
            from: checkAutoHistory(this).children().eq(0).text(),
            to: checkAutoHistory(this).children().eq(1).text(),
            person: checkAutoHistory(this).children().eq(2).text(),
            description: checkAutoHistory(this).children().eq(3).text()
        })
    });
    // получаем информационное сообщение
    let info = await page.$eval('#'+id+' .check-space.check-message', e => e.innerHTML);
    // закрываем сессию
    await browser.close()
    // возвращаем результат
    return JSON.stringify(returnObject.vehicle) !== "{}" ? console.log(JSON.stringify(returnObject)) : console.log(JSON.stringify({ error: info }))
})();