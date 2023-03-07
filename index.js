const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
var jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT;

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h6ly4.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});



// json web token middleware

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send('unauthorized access')
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
    if(err){
      return res.status(403).send({message: 'forbidden access'})
    }
    req.decoded = decoded;
    next()
  })
}



async function run() {
  try {
    client.connect();
    const database = client.db("doctors-portal");
    const appointmentCollections = database.collection("appointments-options");
    const bookingCollections = database.collection("booking");
    const userCollections = database.collection("users");
    const doctorCollections = database.collection("doctors");


    // note: verifyAdmin should be written after verifyToken
    const verifyAdmin = (req, res, next) => {
      
      next()
    }


    //  all treatment options
    app.get("/appointmentOptions", async (req, res) => {
      const query = {};
      const date = req.query.date;
      const options = await appointmentCollections.find({}).toArray();

      const bookingQuery = { appointmentDate: date };

      const alreadyBooking = await bookingCollections
        .find(bookingQuery)
        .toArray();
      options.forEach((option) => {
        const optionBooked = alreadyBooking.filter(
          (book) => book.treatment === option.name
        );
        const bookSlots = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookSlots.includes(slot)
        );
        option.slots = remainingSlots;
      });

      res.send(options);
    });

    // booking appointment
    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      const query = {
        appointmentDate: booking.appointmentDate,
        treatment: booking.treatment,
        email: booking.email,
      };

      const alreadyBook = await bookingCollections.find(query).toArray();
      if (alreadyBook.length) {
        const message = `you already have a booking on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }

      const result = await bookingCollections.insertOne(booking);
      res.send(result);
    });

    // get booking list via email
    app.get("/booking", verifyToken ,async (req, res) => {

      const email = req.query.email;
      const decodedEmail = req.decoded.email;


      if(decodedEmail !== email){
      res.status(403).send({message: 'forbidden access'})
      }
      
      const query = { email: email };
      const result = await bookingCollections.find(query).toArray();
      res.send(result);


    });

    // save user information

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollections.insertOne(user);
      res.json(result);
    });
    
    // save user information for google sign in method
    app.put("/users", async (req, res) => {
      const user = req.body;
      
      const filter = { email: user?.email };
      const options = { upsert: true };
      const updateDoc = {$set:  user };

      const result = await userCollections.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    // get all users
    app.get('/users', verifyToken, async(req, res) => {
  
    const decodedEmail = req?.decoded?.email;
    const query = {email: decodedEmail};
    const user = await userCollections.findOne(query);
    if(user?.role !== 'admin'){
    return res.status(403).send({message: 'forbidden access'})
    }
  
    
    const result = await userCollections.find({}).toArray();
    
    res.send(result)

    })
    
    app.put('/users/admin/:id' ,verifyToken, async(req, res) => {
      
      const decodedEmail = req?.decoded?.email;
      const query = {email: decodedEmail}
      const user = await userCollections.findOne(query);
      if(user?.role !== 'admin'){
      return res.status(403).send({message: 'forbidden access'})
      }
 
      const id = req.params.id;
      const filter = {_id: ObjectId(id)};
      const options = { upsert: true };
      const updateDoc = {
        $set: {role: 'admin'},
      };

      const result = await userCollections.updateOne(filter, updateDoc, options);
      res.send(result)
    })



    app.get('/users/admin/:email', async(req, res) => {
    const email = req.params.email;
    const query = {email: email};
    const user = await userCollections.findOne(query);
    res.send({isAdmin: user?.role === 'admin'})
    })





    // json web token api
    app.get('/jwt', async(req, res) => {

    const email = req.query.email;
    const query = {email: email};
    const user = await userCollections.findOne(query);

    if(user){
    const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'})
    return res.send({accessToken: token})
    }
    res.status(403).send({message: ' '})


    })
    

    app.get('/appointmentSpecialty', async(req, res) => {

      const query = {};
      const result = await appointmentCollections.find(query).project({name: 1}).toArray();
      res.send(result)
      
    })


    app.post('/doctors', async(req, res) => {
      const doctor = req.body;
      const result = await doctorCollections.insertOne(doctor);
      res.send(result)
    })
    

    app.get('/doctors', verifyToken, verifyAdmin,  async(req, res) => {
      // const decodedEmail = req.decoded.email;
      
        const query = {};
        const result = await doctorCollections.find(query).toArray();
        res.send(result)
      
     
     

    })



    app.delete('/doctors/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: ObjectId(id)}
      const result = await doctorCollections.deleteOne(query);
      res.send(result)
    })

    app.get('/addPrice', async(req, res) => {
      const filter = {};
      const options = {upsert: true};
      const updateDoc = {$set:  {price: 99} };
      const result = await appointmentCollections.updateMany(filter, updateDoc, options);
      res.send(result)
    })

    app.get('/booking/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: ObjectId(id)};
      const result = await bookingCollections.findOne(query);
      res.send(result)
    })


    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100
    
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        "payment_method_types": [
          "card"
        ]
       
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    

  } finally {
    // await client.close();
  }
}




run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("doctors portal server is running");
});

app.listen(port, () => {
  console.log(`doctors portal app listening on port ${port}`);
});
