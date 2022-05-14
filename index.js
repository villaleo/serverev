// --- Environment Variables ---
const DB_USER_NAME = process.env['DB_USER_NAME']
const DB_PASSWORD = process.env['DB_PASSWORD']
const DB_ID = process.env['DB_ID']

// --- Constants ---
const express = require('express')
const mysql = require('mysql')
const bcrypt = require('bcrypt')
const session = require('express-session')
const fetch = require('node-fetch')

const pool = dbConnection()
const app = express()
const saltRounds = 10

// --- App settings ---
app.set("view engine", "ejs")
app.use(express.static("public"))
app.use(express.urlencoded({
    extended: true
}))

// By restaurant ID
reviewsById = async (id) => {
    let sql = `
        SELECT * FROM Reviews 
        WHERE restaurant_id = ?
    `

    let rows = await executeSQL(sql, [id])
    return rows
}

// Updating Review
app.get('/updateReview', async (req, res) => {
   let reviewId = req.query.id;
   let rows = await reviewsById(reviewId);
    
   res.render("reviews", {
       'rating': rows[0].rating,
       'details': rows[0].details
    })
})
        
app.post('/updateReview', async (req, res) => {
    let reviewId = req.body.id;
    let rating = req.body.rating;
    let details = req.body.details;

    // Update the review
    let sql = `
        UPDATE Reviews
        SET details = ?
        WHERE id = ?
    `;
    await executeSQL(sql, [details, reviewId]);
    
    // Update the rating
    sql = `
        UPDATE Reviews
        SET rating = ?
        WHERE id = ?
    `;
    await executeSQL(sql, [rating, reviewId]);
    res.redirect("/edit-reviews");
});

// Reviews by customer ID
reviewsByCustomerId = async (id) => {
    let sql = `
        SELECT rev.id, res.name, rating, details
        FROM Reviews rev
        INNER JOIN Restaurants res
            ON rev.restaurant_id = res.id
        WHERE customer_id = ?
    `

    let rows = await executeSQL(sql, [id])
    return rows
}

// Reviews by rating count
reviewsByRating = async(rating) => {
    let sql = `
        SELECT
            rev.rating, rev.details
        FROM Reviews rev
        WHERE rating >= ?
    `
    
    let rows = await executeSQL(sql, [rating])
    return rows
}

// Restaurant from name
restaurantsByName = async (name) => {
    let sql = `
        SELECT DISTINCT res.name, res.picture, rev.rating, res.id
        FROM Restaurants res INNER JOIN Reviews rev
            ON res.id = rev.restaurant_id
        WHERE res.name LIKE ?
    `

    let rows = await executeSQL(sql, [`%${name}%`])
    let entries = {}
    rows.forEach((x) => {
        if (entries[x.name] === undefined) {
            entries[x.name] = x
        }
    })
    
    let result = []
    for (const [key, value] of Object.entries(entries)) {
        result.push(value)
    }
    return result
}

// Restaurant from id
restaurantsById = async (id) => {
    let sql = `
        SELECT *
        FROM Restaurants
        WHERE id = ?
    `

    let rows = await executeSQL(sql, [id])
    return rows
}

// Calculate the popularity of a restaurant given the id
calculatePopularity = async (restaurantId) => {
    let sql = `
        SELECT res.name, rev.details, rev.rating, rev.restaurant_id
        FROM Reviews rev INNER JOIN Restaurants res
            ON rev.restaurant_id = res.id
        WHERE rev.restaurant_id = ?
    `
    let reviews = await executeSQL(sql, [restaurantId])
    
    let total = 0
    reviews.forEach((x) => {
        total += x.rating
    })
    return total / reviews.length
}

// Retrieve a list of all popular restaurants
popularRestaurants = async () => {
    let sql = `
        SELECT res.name, rev.details, rev.rating, rev.restaurant_id, res.picture
        FROM Reviews rev INNER JOIN Restaurants res
            ON rev.restaurant_id = res.id
    `
    let results = await executeSQL(sql)

    let map = {}
    results.forEach((x) => {
        if (map[x.restaurant_id] === undefined) {
            map[x.restaurant_id] = []
        }
        map[x.restaurant_id].push(x.rating)
    })

    let averages = {}
    for (let [restaurant, ratings] of Object.entries(map)) {
        let average = 0
        for (let num of ratings) {
            average += num
        }
        average /= ratings.length
        averages[restaurant] = average
    }

    let popular = []
    for (const [restaurant, average] of Object.entries(averages)) {
        if (average >= 3) {
            let item = await restaurantsById(restaurant)
            popular.push({
                'name': item[0].name,
                'rating': average,
                'picture': item[0].picture,
                'id': restaurant
            })
        }
    }

    return popular
}

// Session
app.set('trust proxy', 1)
app.use(session({
    secret: 'pickles',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }
}))

// Login
app.post('/login', async(req, res) => {
    let username = req.body.username
    let password = req.body.password

    let passwordHash = ""
    let sql = `
        SELECT *
        FROM Customers
        WHERE user_name = ?
    `
    let rows = await executeSQL(sql, [username])
    if (rows.length > 0)
    {
        passwordHash = rows[0].password
    }
    
    const match = await bcrypt.compare(password, passwordHash)
    if (match)
    {
        req.session.user = {
            'first_name': rows[0].first_name,
            'last_name': rows[0].last_name,
            'user_name': rows[0].user_name,
            'id': rows[0].id
        }
        
        req.session.authenticated = true
        res.render('welcome', {
            'first_name': req.session.user.first_name,
            'reviews': await reviewsByCustomerId(req.session.user.id),
            'restaurants': await popularRestaurants()
        })
    }
    else
    {
        res.render('login', {
            "error": "Incorrect Username or Password"
        })
    }
})

// Register
app.get('/register', (req, res) => {
    res.render('register')
})

app.post('/register', async (req, res) => {
    let firstName = req.body.firstName
    let lastName = req.body.lastName
    let userName = req.body.username
    let password = req.body.password

    const hashed = bcrypt.hashSync(password, saltRounds);

    let sql = `
    SELECT *
    FROM Customers
    WHERE user_name = ?
    `
    let existing = await executeSQL(sql, [userName])
    if (existing.length != 0) {
        return res.render('register', {
            'error': `User '${userName}' already exists. Sign in instead.`
        })
    }

    sql = `
    INSERT INTO Customers
    (first_name, last_name, user_name, password)
    VALUES
        (?, ?, ?, ?)
    `

    let results
    try {
        results = await executeSQL(sql, [firstName, lastName, userName, hashed])
    } catch (someError) {
        return res.render('register', {
            'error': `Something went wrong. Please try again.`
        })
    }
    
    res.render('login', {
        'message': 'Account created successfully. Sign in.'
    })
})

app.get('/login', (req, res) => {
   res.render('login')
})

// -- Local API --
app.get('/api/review/:id', async (req, res) => {
    let id = req.params.id
    let sql = `
        SELECT name, rating, details, picture
        FROM Reviews rev INNER JOIN Restaurants res
            ON rev.restaurant_id = res.id
        WHERE rev.id = ?
    `
    let rows = await executeSQL(sql, [id])
    res.send(rows)
})

app.get('/deleteReview/:id', async (req, res) => {
    let id = req.params.id
    let sql = `
        DELETE FROM Reviews
        WHERE id = ?
    `
    await executeSQL(sql, [id])

    let reviews = await reviewsByCustomerId(req.session.user.id)
    res.render('reviews', {
        'reviews': reviews
    })
})

// -- Go Back --
app.get('/goBack', (req, res) => {
    res.redirect('/')
})

// -- Home route (not signed in) --
app.get('/', async (req, res) => {
    res.render('home', {
        'restaurants': await popularRestaurants()
    })
})

// -- Home route (signed in) --
app.get('/welcome', isAuthenticated, async (req, res) => {
    res.render('welcome', {
        'first_name': req.session.user.first_name,
        'reviews': await reviewsByCustomerId(req.session.user.id),
        'restaurants': await popularRestaurants()
    })
})

// -- Home route (logged out) -- 
app.get('/logout', (req, res) => {
    req.session.destroy()
    res.redirect('/')
})

// -- Edit reviews (signed in)
app.get('/edit-reviews', isAuthenticated, async (req, res) => {
    let sql = `
        SELECT id
        FROM Customers
        WHERE user_name = ?
    `
    let rows = await executeSQL(sql, [req.session.user.user_name])

    let reviews = await reviewsByCustomerId(rows[0].id)
    // console.log('reviews[index.js@287]:', reviews)
    
    res.render('reviews', {
        'reviews': reviews
    })
})

// Leave a review
app.get('/addReview/:id', isAuthenticated, async (req, res) => {
    let id = req.params.id
    let result = await restaurantsById(id)
    
    res.render('leaveAReview', {
        'restaurant': id,
        'name': result[0].name
    })
})

app.post('/addReview', async (req, res) => {
    let restaurant = req.body.restaurant
    let rating = req.body.rating
    let details = req.body.details

    let sql = `
        INSERT INTO Reviews
        (restaurant_id, customer_id, rating, details)
        VALUES
            (?, ?, ?, ?)
    `
    await executeSQL(sql, [restaurant, req.session.user.id, rating, details])

    let reviews = await reviewsByCustomerId(req.session.user.id)
    res.render('reviews', {
        'reviews': reviews
    })
})

// -- Search route --
app.get('/results', async (req, res) => {
    let authed = false
    if (req.session.authenticated) {
        authed = true
    }

    let results = await restaurantsByName(req.query.search)
    res.render('searchResults', {
        'search': req.query.search,
        'authed': authed,
        'results': results
    })
})

// All reviews for a restaurant
app.get('/reviews-for/:id', async (req, res) => {
    let id = req.params.id

    let restaurant = await restaurantsById(id)
    restaurant = restaurant[0]

    let authed = false
    if (req.session.authenticated) {
        authed = true
    }

    let sql = `
        SELECT r.customer_id, r.restaurant_id, r.rating,
            r.details, c.first_name, c.last_name
        FROM Reviews r INNER JOIN Customers c
            ON r.customer_id = c.id
        WHERE r.restaurant_id = ?
    `
    let reviews = await executeSQL(sql, [id])

    console.log('[index.js@429]:')
    console.log(`authed=${authed}`)
    console.log(`reviews=`, reviews)
    console.log(`restaurant=`, restaurant)

    res.render('allReviews', {
        'authed': authed,
        'reviews': reviews,
        'restaurant': restaurant
    })
})

// -- Execute the SQL from the given parameters --
async function executeSQL(sql, params) {
    return new Promise (function (resolve, reject) {
        pool.query(sql, params, function (err, rows, fields) {
            if (err) {
                throw err
            }
            resolve(rows)
        })
    })
}

// Middleware for auth
function isAuthenticated (req, res, next){
    if (req.session.authenticated) {
        next()
    }
    else {
        res.render('login')
    }
}

// -- Connect the database --
function dbConnection() {
    const pool = mysql.createPool({
        connectionLimit: 10,
        host: "acw2033ndw0at1t7.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
        user: DB_USER_NAME,
        password: DB_PASSWORD,
        database: DB_ID
    })

    return pool
}

// -- Listen --
app.listen(3000, () => {
    console.log('[index.js]: Server started!')
})
