let canSendMessage = true;


document.getElementById("submit").addEventListener("click", async () => {

    if (!canSendMessage) return;
    canSendMessage = false;

    const promptElement = document.getElementById("prompt");
    const prompt = promptElement.value;
    promptElement.value = "";

    appendUserChat(prompt);
    appendGeneratingResponse();

    fetch('/chat', {
        method : "POST",
        headers : {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ message : prompt })
    }).then(res => res.json()).then(data => {

        removeGeneratingResponse();

        if (!data.response) {
            appendAIChat("Error: No response body");
            return;
        }

        if (data.playlistGenerated) {

            appendAIChat("Here is a playlist generated based on your preferences!");
            displayPlaylist(JSON.parse(data.response));
            return;

        }

        let formattedResponse = data.response.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        formattedResponse = formattedResponse.replace(/\*/g, "<br>");

        appendAIChat(formattedResponse);


    });

});

function appendGeneratingResponse(){

    const newDiv = document.createElement("div");
    newDiv.className = "generatingResponse";
    newDiv.id = "generatingResponse";
    newDiv.innerHTML = 'Generating response...';
    const chat = document.getElementById("chat_content");
    chat.appendChild(newDiv);
    chat.scrollTop = chat.scrollHeight;

}

function removeGeneratingResponse(){

    document.getElementById("chat_content").removeChild(document.getElementById("generatingResponse"));

}

function appendAIChat(message) {

    const newDiv = document.createElement("div");
    newDiv.className = "aiMessage";
    newDiv.innerHTML = message;
    const chat = document.getElementById("chat_content");
    chat.appendChild(newDiv);
    chat.scrollTop = chat.scrollHeight;

    canSendMessage = true;

}

function appendUserChat(message) {

    const newDiv = document.createElement("div");
    newDiv.className = "userMessage";
    newDiv.innerHTML = message;
    const chat = document.getElementById("chat_content");
    chat.appendChild(newDiv);
    chat.scrollTop = chat.scrollHeight;




}

function displayPlaylist(data) {

    const container = document.getElementById("playlist_container");
    container.innerHTML = "";

    const list = document.createElement("ul");
    list.id = "playlist_list";
    list.className = "playlist_list";


    for (let i = 0; i < data.length; i++) {

        const name = data[i].name;
        const artist = data[i].artist;
        const album = data[i].album;

        const newLi = document.createElement("li");
        newLi.innerHTML = `<li><label class="track">${name}</label><br><label class="artist_and_album">${artist} • ${album}</label></li>`

        list.appendChild(newLi);

    }

    container.appendChild(list);
    container.scrollTop = 0;



}

document.getElementById("prompt").addEventListener("keydown", function (event) {

    if (event.key === "Enter") {

        event.preventDefault();
        document.getElementById("submit").click();

    }

});