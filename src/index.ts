import Express from "express";

const app = Express();

app.use(Express.json());
app.post("/register", (req, res) => {
  res.send("Hello World!");
});

app.listen(5261, () => {
  console.log("Server is running on port 5261");
});
