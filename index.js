const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const isAuth = require('./is-auth');

const {
    MongoClient,
    ObjectId
} = require('mongodb');

const dbUrl = "mongodb+srv://cstsortan:123321@cluster0-dbzfx.mongodb.net/eshop?retryWrites=true";
const tokensSecretKey = "SomeSuperSecretKey";


app.use(bodyParser.json());

app.use(express.static('public'));

app.use(isAuth(tokensSecretKey));

MongoClient.connect(dbUrl, {
    useNewUrlParser: true,
}, (err, db) => {
    if (err) return;
    console.log("Connected successfully to the database");

    const productsCol = db.db().collection('products');
    const usersCol = db.db().collection('users');
    const reviewsCol = db.db().collection('reviews');
    const cartProductsCol = db.db().collection('cart-products');


    app.post('/signup', async (req, res) => {
        const {
            email,
            password,
            name
        } = req.body;

        try {
            const existingUser = await usersCol.findOne({
                email
            });
            if (existingUser) {
                res.status(404).send({
                    error: "Email already exists",
                    code: 'email-exists'
                });
                return;
            }

            // So we don't just expose sensitive data in the database!
            const hashedPassword = await bcrypt.hash(password, 12);

            const userDoc = await usersCol.insertOne({
                email,
                name,
                password: hashedPassword,
            });
            res.send({
                ...userDoc.ops[0],
                password: null, // So no password leaks, not even hashed
            });
            return;
        } catch (e) {
            console.log(e);
            res.status(500).send({
                error: "There was an error"
            });
        }
    });

    app.post('/login', async (req, res) => {
        const {
            email,
            password
        } = req.body;

        try {
            const user = await usersCol.findOne({
                email
            });
            if (!user) {
                res.status(404).send({
                    error: "User does not exist",
                    code: 'user-not-found',
                });
                return;
            }
            const isPasswordCorrect = await bcrypt.compare(password, user.password);
            if (!isPasswordCorrect) {
                res.status(404).send({
                    error: "This password is not correct",
                    code: 'password-wrong',
                });
                return;
            }
            const token = jwt.sign({
                userId: user._id,
                email
            }, tokensSecretKey, {
                expiresIn: '1h'
            });
            res.send({
                ...user,
                password: null,
                token,
                tokenExpiration: 1,
            });
            return;
        } catch (e) {
            console.log(e),
                res.status(500).send({
                    error: "There was an error",
                });
            return;
        }
    });

    app.get('/current-user', async (req, res) => {


        if (!req.isAuth) {
            res.status(404).send({
                error: "Not authenticated, please login first",
                message: "You probably missed Authorization token or it's expired, login again"
            });
            return;
        }
        const userId = req.userId;


        try {
            const user = await usersCol.findOne({
                _id: ObjectId(userId)
            });
            if (!user) {
                res.status(404).send({
                    error: "User not found",
                });
                return;
            }

            res.send({
                email: user.email,
                name: user.name,
                _id: user._id,
            });
            return;
        } catch (e) {
            res.status(404).send({
                error: "Invalid user",
            });
            return;
        }

    });

    app.get('/user/:userId', async (req, res) => {
        const userId = req.params.userId;

        try {
            const user = await usersCol.findOne({
                _id: ObjectId(userId)
            });
            if (!user) {
                res.status(404).send({
                    error: "User not found",
                });
                return;
            }

            res.send({
                _id: user._id,
                email: user.email,
                name: user.name,
            });
        } catch (e) {
            res.status(404).send({
                error: "Invalid user",
            })
        }
    });

    app.get('/products', (req, res) => {
        productsCol.find().toArray((err, docs) => {
            if (err) {
                res.status(500).send({
                    error: err.message,
                });
                return;
            }
            res.send({
                products: docs,
            });
        });
    });

    app.post('/cart-products', async (req, res) => {

        if (!req.isAuth) {
            res.status(404).send({
                error: "Not authenticated",
            });
            return;
        }

        const userId = req.userId;

        const {
            productId,
            count
        } = req.body;

        const product = await productsCol.findOne({
            _id: ObjectId(productId)
        });

        if (!product) {
            res.status(404).send({
                error: "Product doesn't exist"
            });
            return;
        }

        const productInCart = await cartProductsCol.findOne({
            productId,
            userId
        });

        if (productInCart) {
            // Product already exists in cart, so we're increasing the count
            const doc = await cartProductsCol.updateOne({
                _id: ObjectId(productInCart._id)
            }, {
                $set: {
                    count: productInCart.count + count
                }
            });
            res.send({
                product: { ...productInCart,
                    count: productInCart.count + count
                }
            });
        } else {
            // Product is not already there
            const product = {
                productId,
                count,
                userId
            };
            await cartProductsCol.insertOne(product);
            res.send({
                product
            });
        }
    });


    app.get('/cart-products', async (req, res) => {
        if (!req.isAuth) {
            res.status(404).send({
                error: "Not authenticated",
            });
            return;
        }

        const userId = req.userId;
        try {
            const productsInCart = await cartProductsCol.find({
                userId
            }).toArray();
            if (!productsInCart || productsInCart === []) {
                res.send({
                    products: [],
                    error: "Cart is empty",
                });
                return;
            }

            const finalProductsInCart = await Promise.all(productsInCart.map(async prod => {
                const productDetails = await productsCol.findOne({
                    _id: ObjectId(prod.productId)
                });
                return {
                    ...prod,
                    ...productDetails,
                };
            }));

            res.send({
                products: finalProductsInCart,
            });
        } catch (e) {
            console.log(e);
            res.status(404).send({
                error: "There was an error",
            })
        }
    });

    app.post('/review/:productId', async (req, res) => {
        const productId = req.params.productId;
        const {
            text,
            count
        } = req.body;

        const product = await productsCol.findOne({
            _id: ObjectId(productId)
        });

        if (!req.isAuth) {
            res.status(404).send({
                error: "Please Sign in first in order to write a review"
            });
            return;
        }

        if (!product) {
            res.status(404).send({
                error: "This product does not exist",
            });
            return;
        }

        if (!text || text === '' || !count || count > 5 || count < 0) {
            res.status(404).send({
                error: "Add a proper review fellas",
            });
            return;
        }

        await reviewsCol.insertOne({
            text,
            count,
            productId,
            authorId: req.userId,
        });

        res.send({
            message: "submitted",
        });
    });

    app.get('/reviews/:productId', async (req, res) => {
        const productId = req.params.productId;

        const reviews = await reviewsCol.find({
            productId
        }).toArray();

        if (!reviews) {
            res.send({
                error: "This product has no reviews",
            });
        } else {
            try {
                const finalReviews = await Promise.all(reviews.map(async review => {
                    const user = await usersCol.findOne({
                        _id: ObjectId(review.authorId)
                    });
                    return {
                        ...review,
                        authorName: user.name,
                        authorEmail: user.email,
                    };
                }));
                res.send({
                    reviews: finalReviews,
                });
                return;
            } catch (error) {
                console.log(error);
                res.status(500).send({
                    error: "There was an error",
                });
                return;
            }
        }
    });

    app.listen(process.env.PORT || 2200, () => {
        console.log("App started on port 2200");
    });
});