require("dotenv").config(); //coeeeeeeeee
const express = require('express'); //express... 
const app = express(); //vytvoření serveru.. může to být klidně "khokot" místo app
const mongoose = require('mongoose'); //Připojení k DB
const moment = require('moment-timezone'); //Pro případný formátování času
const http = require('http'); //Certifikát není třeba, pojede to přes tunel na tarkovbota, takže http, aby se nemusel řešit bordel kolem
const compression = require('compression'); //Komprese, chapeš ne
const fs = require('fs/promises'); //Čtení/Zapisování do souboru
const { readFile } = require('fs').promises; //Čtení souborů
const path = require('path');  //Čtení/Zapisování do souboru
const request = require("request"); //Odesílání post requestů
const bodyParser = require('body-parser'); //Nutné pro získávání dat z formulářů


//============================================= NASTAVENÍ SERVERU =============================================

//KOMPRESE
//S headerem xnocompression nebude komperese, nebude ani když je content-type image nebo neexistuje tento header
function shouldCompress(req, res) {
	if (req.headers['x-no-compression']) {
		return false;
	}
	const contentType = res.getHeader('Content-Type');
	return !contentType || !contentType.startsWith('image/');
}


app.use(compression({ filter: shouldCompress })); //Použití komprese s vyjimkou/filterem
app.set('view engine', 'ejs'); //používají se .ejs stránky, tak to sem napíšu
app.use(express.static('public')); //veškeré soubory ze složky public půjdou získat přes url/path
app.use(express.urlencoded({ extended: true })); //Nutné pro získávání dat z formulářů


const httpServer = http.createServer(app);

// === LIVE ===
let ipAddress = "192.168.0.85"; // poznámka pro apače, tunel bez přesné ip nefunguje
let port = 8090;

// === DEV ===
const __dev = false; // true => devmode // false => production mode

if(__dev)
	port = 80;

httpServer.listen(port, ipAddress, () => {
	console.log(`Server běží: ${ipAddress}:${port}`);
});



//=============================================================================================================





//==================================================== PROMĚNNÉ ===============================================
let connectToDB = true;
const unbanWebhook = process.env.UNBAN_WEBHOOK;
//=============================================================================================================





//============================================= AKTUALIZACE DAT =============================================
let banlistDB;

if (connectToDB) {
	banlistDB = mongoose.createConnection(process.env.DB_CONNECTION_STRING);

	async function stazeniDoSouboru(collectionName) {
		try {
			const collectionData = await banlistDB.collection(collectionName).find({}).sort({ createdAt: -1 }).toArray(); //vycucne data do arraye
			await fs.writeFile(`./data/banlist/${collectionName}.json`, JSON.stringify(collectionData, null, 2));
		} catch (error) {
			console.error(`Error pro ${collectionName}:`, error);
		}
	}

	function autoUpdate(collections) {
		collections.forEach(collectionName => {
			stazeniDoSouboru(collectionName); //Stáhne data při spuštění
			setInterval(() => stazeniDoSouboru(collectionName), Math.floor(Math.random() * (10 - 5 + 1) + 5) * 60000); //Aktualizace každých 5 - 10 minut
		});
	}

	banlistDB.once('open', () => {
		console.log('MongoDB - Připojeno');
		const collections = ['bans', 'mutes', 'warns', 'pbans']; //Které kolekce z DB
		autoUpdate(collections); //Spustí aktualizaci
	});

	banlistDB.on('error', (error) => {
		console.error('MongoDB error:', error);
	});
}
//=============================================================================================================





app.get("/", async (req, res) => {
	res.render("main/index", {
	});
});


//----------------------------------------------------------------------------------------------------
//------------------------------------------- BAN/MUTE LIST ------------------------------------------
//----------------------------------------------------------------------------------------------------



app.get("/penalizace", async (req, res) => {
	//Definování přímo v requestu na /, aby to mělo vždy aktuální data
	//Kdyby to bylo mimo app.get, tak to bude mít první data uložené v paměti do restartu serveru
	const bans = JSON.parse(await readFile('./data/banlist/bans.json', 'utf-8'));
	const pbans = JSON.parse(await readFile('./data/banlist/pbans.json', 'utf-8'));
	const mutes = JSON.parse(await readFile('./data/banlist/mutes.json', 'utf-8'));

	res.render("main/penalties", {
		//Odešle data
		bans,
		pbans,
		mutes,
		moment
	});
})



//----------------------------------------------------------------------------------------------------
//------------------------------------------- UNBAN ŽÁDOST -------------------------------------------
//----------------------------------------------------------------------------------------------------

app.get("/zadost-o-unban", async (req, res) => {
	res.render("main/unbanzadost", {
	});
});

app.post("/zadost-o-unban", async (req, res) => {


	try {
		const connectingIp = req.headers['cf-connecting-ip'] || "nothing";

		const zadostiData = await fs.readFile('./data/banlist/zadosti.json', 'utf8').then(JSON.parse).catch(error => console.error(error.message));

		const formData = req.body; //získá tělo z requestu
		const userid = formData['userid']; //data z části, kde je name "userid" ve formuláři
		const duvodbanu = formData['duvodbanu'];
		const procunban = formData['procunban'];

		const timestamp = new Date().getTime(); //Aktální čas jako UNIX
		const ID = timestamp + "_" + Math.floor(Math.random() * 123).toString(); //UNIX + random číslo na ID

		//Do již získaných žádostí přidá novou s hodnotama nahoře
		zadostiData.push({
			ID: ID,
			timestamp: timestamp,
			userID: userid,
			duvod: duvodbanu,
			procunban: procunban,
			unbanned: false
		});

		//Zapíše aktualizované žádosti zpět do souboru
		await fs.writeFile("./data/banlist/zadosti.json", JSON.stringify(zadostiData, null, 2));

		//Vytvoření embedu pro discord zprávu
		const message = {
			embeds: [
				{
					title: "NOVÁ ŽÁDOST O UNBAN",
					color: 65280,
					fields: [
						{
							name: "ID Žádosti:", value: ID, inline: true,
						},
						{
							name: "ID Uživatele:", value: userid, inline: true,
						},
						{
							name: "Zadaný důvod banu:", value: duvodbanu, inline: false,
						},
						{
							name: "Proč by chtěl unban:", value: procunban, inline: false,
						},
						{
							name: "IP:", value: connectingIp, inline: false
						}
					],
				},
			],
		};

		//Odeslání embed zprávy
		request.post({
			url: unbanWebhook,
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(message),
		});

		res.redirect(`/unbansuccess?ID=${ID}`);

	} catch (err) {
		//Když se něco posere načte mu to errortemplate.ejs, kde se využívá error pro výpis co se posralo
		res.render("main/errortemplate", {
			error: `Nepodařilo se odeslat žádost o unban. Aktualizuj stránku (Ctrl+F5) a zkus to znovu<br>${err}`
		})
	}
})


app.get("/unbansuccess", (req, res) => {
	const ID = req.query.ID; //získá ID value z url
	res.render("main/unbansuccess", { ID });
});


//----------------------------------------------------------------------------------------------------
//------------------------------------------- STAV ŽÁDOSTI -------------------------------------------
//----------------------------------------------------------------------------------------------------

app.get("/zkontrolovat-unban", async (req, res) => {
	res.render("main/stavzadosti", {
	});
});


app.post("/zkontrolovat-unban", async (req, res) => {
	try {
		const zadostiData = await fs.readFile('./data/banlist/zadosti.json', 'utf8').then(JSON.parse).catch(error => console.error(error.message));

		const formData = req.body; //získá tělo z requestu
		const idzadosti = formData['idzadosti'];



		let zadost = zadostiData.find(zadost => zadost.ID === idzadosti); //pokusí se najít žádost s tímto ID v souboru

		if (zadost) { //když najde
			res.render("main/unbanstav", {
				existuje: true,
				id: zadost.ID,
				timestamp: zadost.timestamp,
				userID: zadost.userID,
				duvod: zadost.duvod,
				procunban: zadost.procunban,
				unbanned: zadost.unbanned
			})
		} else { //když nenajde
			res.render("main/unbanstav", {
				existuje: false
			})
		}

	} catch (err) {
		//Když se něco posere načte mu to errortemplate.ejs, kde se využívá error pro výpis co se posralo
		res.render("main/errortemplate", {
			error: `Nepodařilo se zkontrolovat stav. Aktualizuj stránku (Ctrl+F5) a zkus to znovu<br>${err}`
		})
	}
});




app.get("/adminpanel", async (req, res) => {
	try {
		res.render("main/login")
	} catch (err) {
		res.render("main/errortemplate", {
			error: `Chyba:<br>${err}`
		})
	}
});



app.post("/adminpanel", async (req, res) => {
	try {
		const formData = req.body;
		const jmeno = formData['jmeno'];
		const heslo = formData['heslo'];

		const loginData = await fs.readFile('./data/logins.json', 'utf8').then(JSON.parse).catch(error => console.error(error.message));

		let login = loginData.find(login => login.jmeno === jmeno);

		if (login && login.heslo === heslo) {
			const zadosti = await fs.readFile('./data/banlist/zadosti.json', 'utf8').then(JSON.parse).catch(error => console.error(error.message));
			res.render("main/adminpanel", {
				zadosti,
				moment
			});
		} else {
			res.render("main/errortemplate", {
				error: `Tenhle login tu není`
			})
		}

	} catch (err) {
		res.render("main/errortemplate", {
			error: `Chyba:<br>${err}`
		})
	}
});
