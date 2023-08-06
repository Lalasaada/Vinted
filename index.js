require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const SHA256 = require("crypto-js/sha256");
const encBase64 = require("crypto-js/enc-base64");
const uid2 = require("uid2");
mongoose.connect(process.env.MONGODB_URI);
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
app.use(cors());

app.use(express.json());
cloudinary.config(process.env.CLOUDINARY);

const convertToBase64 = (file) => {
  return `data:${file.mimetype};base64,${file.data.toString("base64")}`;
};

const isAuthenticated = async (req, res, next) => {
  try {
    if (req.headers.authorization) {
      const receivedToken = req.headers.authorization.replace("Bearer ", "");
      // console.log(receivedToken); //s6tWy3DkBp7SPFsl
      const owner = await User.findOne({ token: receivedToken }).select(
        "account"
      );
      if (owner) {
        console.log(Object.keys(req));
        req.user = owner;
        return next();
      } else {
        return res.status(401).json("Unauthorized");
      }
    } else {
      return res.status(401).json("Unauthorized");
    }
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
// MODEL
const User = mongoose.model("User", {
  email: String,
  account: {
    username: String,
    avatar: Object, // nous verrons plus tard comment uploader une image
  },
  newsletter: Boolean,
  token: String,
  hash: String,
  salt: String,
});
const Offer = mongoose.model("Offer", {
  product_name: String,
  product_description: String,
  product_price: Number,
  product_details: Array,
  product_image: Object,
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

app.get("/", (req, res) => {
  try {
    return res.status(200).json({ message: "Bienvenue sur Vinted" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});
// ROUTE POUR CREER UN NEW USER
app.post("/user/signup", async (req, res) => {
  try {
    const { username, email, newsletter, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Missing parameters" });
    } else {
      const existingUser = await User.findOne({ email: email });
      console.log(existingUser); // affiche un utilisateur trouvé ou null
      if (!existingUser) {
        // console.log(password); // azerty
        const salt = uid2(16); // crée une string de 16 caractères aléatoires
        const token = uid2(16); // crée une autre string de 16 caractères aléatoires
        // On récupère le password pour lui ajouter (en concaténant), le salt :
        const saltedPassword = password + salt;
        // console.log(saltedPassword); // azertyTX6uBvIZidXTnX-G
        const hash = SHA256(saltedPassword).toString(encBase64);
        // console.log(hash); // EX+ZvfkYXQQCoCwA3CM2sOEaNHuLOw8kYOh6l1AxUA0=
        const newUser = new User({
          email: email,
          account: {
            username: username,
          },
          newsletter: newsletter,
          token: token,
          hash: hash,
          salt: salt,
        });
        // console.log(newUser);
        // {
        //     email: 'johndoe@lereacteur.io',
        //     account: { username: 'JohnDoe' },
        //     newsletter: true,
        //     token: 'tvUAvcaThv2JDY1d',
        //     hash: 'n//vmKQsbfPAPFsN7wmAsL42ivrqd7XDrraMffg3/D0=',
        //     salt: '7pcer5j-orxALgTh',
        //     _id: new ObjectId("64ca1227a1aee9adaba3156c")
        //   }

        await newUser.save();
        const responseObject = {
          _id: newUser._id,
          token: newUser.token,
          account: {
            username: newUser.account.username,
          },
        };
        return res.status(201).json(responseObject);
      } else {
        return res
          .status(409)
          .json({ message: "Cet email est déjà utilisé !" });
      }
    }
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

// ROUTE POUR SE CONNECTER
app.post("/user/login", async (req, res) => {
  try {
    console.log(req.body);
    // récupérer l'email pour retrouver l'utilisateur en base de données (s'il existe);
    const foundUser = await User.findOne({ email: req.body.email });
    console.log(foundUser);
    if (foundUser) {
      // vérifier le password
      const newHash = SHA256(req.body.password + foundUser.salt).toString(
        encBase64
      );
      if (newHash === foundUser.hash) {
        const responseObject = {
          _id: foundUser._id,
          token: foundUser.token,
          account: {
            username: foundUser.account.username,
          },
        };
        return res.status(200).json(responseObject);
      } else {
        return res.status(400).json({ message: "password or email incorrect" });
      }
    } else {
      return res.status(400).json({ message: "email or password incorrect" });
    }
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});
// ROUTE POUR CREER UNE OFFRE
app.post("/offers", isAuthenticated, fileUpload(), async (req, res) => {
  try {
    const { title, description, price, condition, city, brand, size, color } =
      req.body;
    console.log(req.body);
    console.log(req.headers.authorization);
    console.log(req.files.picture);
    // créer notre offre
    const newOffer = new Offer({
      product_name: title,
      product_description: description,
      product_price: price,
      product_details: [
        {
          MARQUE: brand,
        },
        {
          TAILLE: size,
        },
        {
          ÉTAT: condition,
        },
        {
          COULEUR: color,
        },
        {
          EMPLACEMENT: city,
        },
      ],

      // image
      // owner
    });
    newOffer.owner = req.user;

    // trouver un moyen d'envoyer notre image à cloudinary
    const convertedFile = convertToBase64(req.files.picture);
    // console.log(convertedFile);
    const uploadResponse = await cloudinary.uploader.upload(convertedFile);
    newOffer.product_image = uploadResponse;

    console.log(newOffer);
    // sauvegarder l'offre
    await newOffer.save();
    return res.status(201).json(newOffer);

    // console.log(owner);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.all("*", (req, res) => {
  return res.status(404).json({ message: "Cette page est introuvable" });
});
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log("Server has started");
});
