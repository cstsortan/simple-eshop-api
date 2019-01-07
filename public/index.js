const proxyUrl = "";// "https://cors-anywhere.herokuapp.com/";
const url =  ""; //'https://damp-dawn-76440.herokuapp.com';
let token = '';

function createUrl(endpoint) {
    return proxyUrl + url + endpoint;
}

function postData(endpoint, data, headers = {}) {
    return fetch(createUrl(endpoint), {
        method: "POST",
        body: JSON.stringify(
            data,
        ),
        // mode: "no-cors",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
    }).then(res => res.json());
}

function getData(endpoint, headers = {}) {
    return fetch(createUrl(endpoint), {
        method: "GET",
        // mode: "no-cors",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
    }).then(res => res.json());
}

function getProducts() {
    return fetch(createUrl('/products'), {
        method: "GET",
    }).then(res => res.json());
}


function signup(email, password, name) {
    return postData('/signup', {
        email,
        password,
        name,
    });
}

function signin(email, password) {
    return postData('/login', {
        email,
        password,
    });
}

function getReviews(productId) {
    return getData(`/reviews/${productId}`);
}

function postReview(productId, text, count) {
    return postData(`/review/${productId}`, {
        text,
        count,
    }, {
        "Authorization": "JWT " +token,
    });
}

function getCurrentUser() {
    return getData('/current-user', {'Authorization': "JWT " +token});
}

getProducts().then(res => console.table(res.products));

// signup('test@test.gr', '12345', "Chris").then(res => console.log(res));
signin('test2@test.gr', '123456').then(res => {
    console.log(res);
    token = res.token;
    getCurrentUser().then(console.log);
});

