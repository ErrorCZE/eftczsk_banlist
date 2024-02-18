const pbanBtn = document.getElementById("p-pban-btn");
const muteBtn = document.getElementById("p-mute-btn");
const pbanTable = document.getElementById("pban-table");
const muteTable = document.getElementById("mute-table");

pbanTable.style.display = "grid";
muteTable.style.display = "none";

pbanBtn.addEventListener("click", () => {
	pbanTable.style.display = "grid";
	muteTable.style.display = "none";
})

muteBtn.addEventListener("click", () => {
	pbanTable.style.display = "none";
	muteTable.style.display = "grid";
});