document.querySelectorAll(".editable").forEach((link) => {
    link.addEventListener("click", displayReviewInfo)
})

var pictureArray = ["brunch", "breakfast", "plates","dinner", "lunch"];
//functions
displayBackground();

async function displayBackground(){
    let shuffledArray = _.shuffle(pictureArray);
    let imageUrl = `https://pixabay.com/api/?key=5589438-47a0bca778bf23fc2e8c5bf3e&q=${shuffledArray[0]}&orientation=horizontal`;
    let data = await fetchData(imageUrl);
    document.querySelector("body").style.background = `url('${data.hits[0].webformatURL}')`;
    document.querySelector("body").style.backgroundSize = "cover";
}
  
async function displayReviewInfo() {
    let modal = new bootstrap.Modal(document.getElementById('reviewModal'));
    modal.show();

    const reviewId = this.id;

    let url = `/api/review/${reviewId}`;
    let response = await fetch(url);
    let data = await response.json();

    let radioOutputString = ''
    for (let i = 1; i <= 5; i++) {
        let required = ''
        let checked = ''

        if (i == 0) {
            required = 'required'
        }
        if (i == data[0].rating) {
            checked = 'checked'
        }
        
        radioOutputString += `
            <input type="radio" name="rating" id="${i}" value="${i}" ${required} ${checked}>
            <label for="${i}">${i}</label>
        `
    }
    document.getElementById("ratingInput").innerHTML = radioOutputString;

    document.getElementById("hiddenId").innerHTML = `
        <input type="hidden" name="id" value="${reviewId}">
    `;
    document.getElementById("details").innerHTML = `${data[0].details}`;
    document.getElementById("reviewModalLabel").innerHTML = `${data[0].name}`;
}

async function fetchData(url){
   let response = await fetch(url);
   let data = await response.json();
   // console.log(data);
   return data;
}
