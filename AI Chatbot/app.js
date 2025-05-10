
// SOEN 287 Bonus Assignment
// Written by Ghassan Naja

// This is the server-side script that handles an AI chatbot that generate a music playlist
// for the user based on their preferences. The user will provided preferences such as artists,
// titles, albums, mood, genres...
// The Chatbot will determine the user preference based on this and the playlist is generated.
// We make use of Google Gemini to integrate the Generative-AI agent
// We also use the Spotify API to search music by title, album and artist

// ------ Typical flow of usage ------
// - The user enters the web page
// - The user submits a message to the AI chatbot
// - The chatbot will determine the user's preference based on given input or ask for more information
// - Once the chatbot has enough information, it will generate text in JSON format that contains albums, artists and track titles that the user would enjoy
// - We then extract the JSON data, parse it and send it to the Spotify API
// - For specific artists, we will find the artist's top tracks
// - For specific albums, we will find the album's top tracks
// - For individual tracks, we will find their title, album and artist name as listed on Spotify
// - We send back an array of JSON objects to the client. The JSON objects contain individual tracks with their title, artist and album
// - The client-side handles displaying the received tracks properly


const PORT = 3000;
const express = require('express');
const app = express();
const fs = require('fs')
require('dotenv').config();

// GEMINI STUFF
// We need a key to be able to access the Chatbot. It is unique and secret
// We are importing the google/genai module and creating our new AI object with the key

const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({apiKey : process.env.GEMINI_API_KEY});

// SPOTIFY STUFF
// To access the spotify API, we need the Spotify Client ID and Spotify Client Secret
// In addition, we also need a token whenever we send requests to the API
// The ID and secret are used to get the token
const clientID = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
let spotifyToken = undefined;


// We are using express
app.use(express.static('public'));
app.use(express.json())


//This array is the chat history. We will append a new JSON object to it every time
//the user and the AI interact
//History is important for context awareness. Without it, the AI would forget every previous prompt
//It is preloaded with instruction so that the chatbot is aware of its task
let chatHistory = [
    {role : 'user', parts : [{text : "You are a helpful AI assistant that specializes in creating music playlists for the user. " +
            "The user will provide with their preferences, such as artists, albums, tracks, era, mood,... " +
            "Your role is to determine their preferences and based on that, give data in JSON format with the following keys : artists, albums, tracks " +
            "You will input an array in each keys, containing the information. You will determine this information based on what the user tells you. " +
            "For track titles, make sure to include the name of the artist next to them (in the same string)" +
            "If the user doesn't provide enough infwormation ask for more but don't insist. if you still don't get anything you can fill out data by yourself. " +
            "It is very important that the keys in the JSON are albums, artists, tracks. " +
            "Also, make sure the artists, albums and tracks provided by the user actually exist. If the user insists that the album/track/artist exists, include it " +
                "If the user wants music from ONLY specific artists or albums, then make sure not to include anything else." }]},
    {role : 'model', parts : [{text : "Understood"}]}
];



//This request loads the main page by reading it from a file
app.get('/', (req, res) => {

   fs.readFile('public/chat.html', 'utf8', (err, data) => {

       if(!err) res.send(data);
       else res.send(":(");

   });

});

// This post route handles the chat feature
// It is called whenever the user submits a prompt to the chatbot
// We call the askAI function which sends the prompt to the chatbot and awaits the response
// Then, we check if the response has any valid JSON formatting
// If it does, we send the data to extractTracks to get individual tracks ready to send to the server
// If extractTracks throws any error we handle it
// If there is no valid JSON we simply send the chatbot's response
app.post('/chat', async (req, res) => {

    res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    const response = await askAI(req.body.message);

    const hasJSON = await extractJSON(response);
    console.log(hasJSON);


    if (hasJSON) {

        try {

            const data = await extractTracks(hasJSON)
            if (!data) throw new Error('Data is empty or does not exist');

            res.json({response: JSON.stringify(data), playlistGenerated: true});

        } catch (err) {
            res.json({response : "Error generating playlist", playListGenerated : false});
        }

    } else {
        console.log(response)
        res.json({response : response, playListGenerated : false});
    }

});

app.listen(PORT, () => {

    console.log(`Listening on port ${PORT}`);

});

// The askAI function will send a request to the Google Gemini API
// Gemini needs an array containing the conversation. In our case it's the chatHistory array.
// We push the user's message as well as the role (in this case it's 'user')
// Then, we await for Gemini's response.
// We push the response to chatHistory along with the role ('model') and we return the response text
async function askAI(message) {

    try {

        chatHistory.push( {role : 'user', parts : [{text : message}]} );

        const response = await ai.models.generateContent({

            model : 'gemini-2.0-flash',
            contents : chatHistory

        });

        chatHistory.push( {role : 'model', parts : [{text : response.text}]} );

        return response.text

    } catch (err) {

        console.log(err);
        return 'Error generating response';

    }

}

// This function will look if the AI's response has any valid JSON text in it
// Since the AI's response is in markup language, we look for '```json' and '```'
// We can then know that the JSON text will be inside.
// We extract it, parse it, and return it.
// If there is no valid JSON, we return undefined
// In case the JSON inside the wrapper isn't valid, we have a try-catch statement to handle the error
async function extractJSON(message) {


    const start = message.indexOf('```json');
    const end = message.indexOf('```', start + 6);

    if (start=== -1 || end === -1) {

        return undefined;

    }

    const jsonString = message.substring(start + 7, end);

    try {
        return await JSON.parse(jsonString);
    } catch (err) {
        return undefined;
    }

}

// In this function, we have logic for individual tracks, albums and playlists
// We search for the artists top tracks, album top tracks, and individual track
// We have the tracks array that holds all the tracks (which are a JSON object with keys name, artist, album)
// Then, we give the tracks array to removeDuplicates to see if there are any duplicates and remove them
// Finally, we shuffle tracks by giving it to shuffleTracks
// We write the tracks to an external file for reference, and return the tracks array
// (at this point, the array is ready to be sent to client side)
async function extractTracks(data) {

    let tracks = [];

    if (Array.isArray(data.artists)) for (let i = 0; i < data.artists.length; i++) {

        const topTracks = await searchSpotifyArtistTopTracks(data.artists[i], 3);
        if (topTracks) tracks.push(...topTracks);

    }

    if (Array.isArray(data.albums)) for (let i = 0; i < data.albums.length; i++) {

        const topTracks = await searchSpotifyAlbumTopTracks(data.albums[i], 3);
        if (topTracks) tracks.push(...topTracks);

    }

    if (Array.isArray(data.tracks)) for (let i = 0; i < data.tracks.length; i++) {

        const track = await searchSpotifyTrack(data.tracks[i]);
        if (track) tracks.push(...track);

    }

    tracks = removeDuplicates(tracks);
    tracks = shuffleTracks(tracks);

    await writeTracksToFile(tracks);

    return tracks;

}

// This function allows to get the Spotify token needed to make requests
// We format the post request properly, give the ID and Secret, and await the response
// In case of an error we throw it to handle it elsewhere
async function getSpotifyToken() {

    if (spotifyToken) return spotifyToken;

    try {

        const result = await fetch("https://accounts.spotify.com/api/token", {

            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(clientID + ':' + clientSecret)
            },
            body: 'grant_type=client_credentials'

        });

        const data = await result.json();

        const t = data.access_token;
        if (!t) throw new Error('No access token');

        return t;

    } catch (err) {

        console.log("Couldn't get spotify token");
        throw err;

    }

}

// This function sends a request to the spotify API to get a specific track
// It returns a JSON object with keys name, artist, album
// In case of an exception, we return undefined
// To get information about a track, we first get the track id by sending the name to the server
// We then use the id to request information about the track, such as album and artist
async function searchSpotifyTrack(track) {

    try {
        track = String(track);

        const token = await getSpotifyToken();

        const params = new URLSearchParams({
            'q': track,
            'type': 'track',
            'limit': '1'
        });

        console.log(`Requesting : https://api.spotify.com/v1/search?${params}`);


        const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {

            headers: {
                'Authorization': `Bearer ${token}`
            }

        });

        let tracks = [];

        const data = await res.json();

        const name = data.tracks.items[0].name;
        const artist = data.tracks.items[0].album.artists[0].name;
        const album = data.tracks.items[0].album.name;


        console.log(name, artist, album);
        tracks.push({

            name: name,
            artist: artist,
            album: album

        });

        return tracks;
    } catch (err) {

        console.log('Could not get track');
        return undefined;

    }

}

// This function takes an album title and returns the album's top tracks
// Since Spotify API doesn't offer a feature to get top tracks from an album immediately, we need to do it
// in several steps
// First, we search for the album id by giving the album name
// Then, we request all the tracks in an album by providing the album id
// Then, we extract the individual IDs of each track
// Using the individual IDs, we can request information about each individual track, which includes the track popularity
// Finally, we sort the tracks by popularity and return the top tracks (we return name, artist, album)
async function searchSpotifyAlbumTopTracks(album, num) {

    try {
        album = String(album);

        const token = await getSpotifyToken();

        const params = new URLSearchParams({
            'q': album,
            'type': 'album',
            'limit': '1'
        });

        console.log(`Requesting : https://api.spotify.com/v1/search?${params}`);


        const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {

            headers: {
                'Authorization': `Bearer ${token}`
            }

        });

        const data = await res.json();

        let numTracks = data.albums.items[0].total_tracks;
        if (numTracks > 50) numTracks = 50;
        console.log(numTracks);
        const id = data.albums.items[0].id;
        const artist = data.albums.items[0].artists[0].name;
        const albumName = data.albums.items[0].name;

        console.log(`Requesting https://api.spotify.com/v1/albums/${id}/tracks`)

        const res2 = await fetch(`https://api.spotify.com/v1/albums/${id}/tracks?limit=${numTracks}`, {

            headers: {

                'Authorization': `Bearer ${token}`
            }

        });


        let ids = [];

        const data2 = await res2.json();


        for (let i = 0; i < data2.items.length; i++) {

            ids.push(data2.items[i].id);

        }

        ids = ids.join(",");
        console.log(ids);

        const res3 = await fetch(`https://api.spotify.com/v1/tracks?ids=${ids}`, {

            headers: {

                'Authorization': `Bearer ${token}`

            }

        });

        const data3 = await res3.json();


        let sortedTracks = data3.tracks.sort((a, b) => b.popularity - a.popularity);

        if (sortedTracks.length > num) sortedTracks = sortedTracks.slice(0, num);

        const tracks = [];

        for (let i = 0; i < sortedTracks.length; i++) {

            const track = sortedTracks[i].name;
            const artistName = sortedTracks[i].album.artists[0].name;
            const albumName = sortedTracks[i].album.name;

            tracks.push({

                name: track,
                artist: artistName,
                album: albumName,

            });

        }

        return tracks;
    } catch (err) {

        console.log('Could not get track');
        return undefined;

    }




}

// This function finds the artist's top tracks and sends them back to the user
// name is the name of the artist, num is the number of tracks we want (if num = 3 then we will get the top 3 tracks)
// For this, we first find the artist's id by searching using the name
// We then use the id to fetch information about top tracks
// (The Spotify API allows to get artist's top tracks but we need to provide an ID, which is why we search for it first)
async function searchSpotifyArtistTopTracks(name, num) {

    try {

        name = String(name);

        const token = await getSpotifyToken();

        const params = new URLSearchParams({

            'q': name,
            'type': 'artist',
            'limit': '1'

        });

        console.log(`Requesting : https://api.spotify.com/v1/search?${params}`);

        const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {

            headers: {
                'Authorization': `Bearer ${token}`
            }

        });

        const data = await res.json();
        const artistName = data.artists.items[0].name;
        const id = data.artists.items[0].id;

        console.log(id);

        const res2 = await fetch(`https://api.spotify.com/v1/artists/${id}/top-tracks`, {

            headers: {
                'Authorization': `Bearer ${token}`
            }

        });

        const topTracks = await res2.json();

        const tracks = [];

        for (let i = 0; i < topTracks.tracks.length && i < num; i++) {

            const trackName = topTracks.tracks[i].name;
            const album = topTracks.tracks[i].album.name;

            console.log(trackName, artistName, album);

            tracks.push({

                name: trackName,
                artist: artistName,
                album: album

            });

        }

        return tracks;

    } catch (err) {

        console.log("Could not get artist top tracks");
        return undefined;

    }

}

// This function writes the tracks to an external txt file. Used for debugging.
// It writes them line by line in the following format : title - artist - album
async function writeTracksToFile(tracks, filename = 'playlist.txt') {

    const lines = tracks.map(track => `${track.name} - ${track.artist} - ${track.album}`);
    const content = lines.join('\n');

    fs.writeFileSync(filename, content, 'utf8');
    console.log(`Playlist written to ${filename}`);

}

// This function removes duplicates from the tracks array
// We compare the track name, artist and album and remove any duplicates from the array
// We normalize the entries by removing any keywords such as Remastered, Edit, Live, Version
// We also remove all non-letter characters
// This ensures a more accurate filter
function removeDuplicates(tracks) {

    const filtered = [];

    for (let i = 0; i < tracks.length; i++) {

        let duplicateFound = false;

        for (let j = 0; j < filtered.length; j++) {

            const [namej, namei, artistj, artisti, albumj, albumi] = [

                normalizeName(filtered[j].name),
                normalizeName(tracks[i].name),
                normalizeName(filtered[j].artist),
                normalizeName(tracks[i].artist),
                normalizeName(filtered[j].album),
                normalizeName(tracks[i].album)

            ];

            if (namei === namej && artisti === artistj && albumi === albumj) duplicateFound = true;

            if (duplicateFound) break;

        }

        if(duplicateFound) continue;
        filtered.push(tracks[i]);

    }

    return filtered;

}

// This function is used to normalize the names and described in removeDuplicates
function normalizeName(str) {

    return str
        .toLowerCase()
        .replace(/[\s\W_]+/g, '')
        .replace(/(remaster(ed)?|live|version|explicit|clean|edit|radio|edition|anniversary)/gi, '');

}

// This function allows to shuffle the tracks for variation
// We pick a random element from the provided array, push it to a new array, and remove it from the old one
// We repeat the process until all tracks are removed. We then have a shuffled array which we can return
function shuffleTracks(tracks) {

    const shuffled = [];

    while (tracks.length > 0) {

        const rand = Math.floor(Math.random() * tracks.length);

        if (rand >= tracks.length) return tracks

        shuffled.push(tracks[rand]);
        tracks.splice(rand, 1);

    }

    return shuffled;

}
