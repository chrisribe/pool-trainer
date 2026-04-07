/**
 * Main script file for the pool simulation
 * Script contains the following Classes:
 *  CUE
 *  CIRCLE
 *  HOLE
 *  BUMPER
 *
 * @author Pranj Patel, Logan Vaughan
 *
 */

// Global Variables
let circles = []; // array to hold all Circle objects
let holes = []; // array to hold all Hole objects
let bumpers = []; // array to hold all Bumper objects
let poolTableX = 1000; // width of the pool table (also the canvas width)
let poolTableY = 500; // height of the pool table (also the canvas height)
let poolTableBorder = 30; // width of the border around the pool table
let bumperLength = 6; // width of the bumpers around the pool table
let bumperIndent = 2; // length of the corner cut-outs on the bumpers
let cornerHoleShift = 5; // the distance that the corner holes are shifted away from the border
let middleHoleShift = 5; // the distance that the middle holes are shifted away from the border
let holeRadius = 23; // radius of the holes
let wallT = poolTableBorder + bumperLength; // position of the top wall (used for collision)
let wallB = poolTableY - poolTableBorder - bumperLength; // position of the bottom wall (used for collision)
let wallL = poolTableBorder + bumperLength; // position of the left wall (used for collision)
let wallR = poolTableX - poolTableBorder - bumperLength; // position of the right wall (used for collision)
let wallCoefRest = 0.5; // coefficient of restitution for collisions between circles and walls
let circleCoefRest = 0.9; // coefficient of restitution for collisions between multiple circles
let coefRoll = 0.01; // coeffRoll is in units/frame^2
let projectionMode = 3; // chosen projection mode
let coordinateSystem = 1; // chosen coordinate system
let predictionView = false; // whether or not projections are being shown
let directionView = true; // whether or not direction is being shown
let coordinateView = true; // whether or not the axis is being shown
let motion  = false; // whether or not any balls are moving
let ballHit = false; // whether or not a ball has been hit
let ballNum = 0; // the number of the first ball hit
let calc = false;

/**
 * Creates the canvas and sets up the pool table
 */
function setup() {
    frameRate(144);
    var canvas = createCanvas(poolTableX, poolTableY);
    canvas.parent("container");
    resetGame();
};

/**
 * Runs and updates the game 
 */
function draw() {
    background(10, 108, 3);
    drawBorder();
    for (let i = 0; i < bumpers.length;i++){
        bumpers[i].show();
    }
    for (let i=0; i < holes.length; i++) {
        holes[i].show();
    }
    for (let i=1; i < circles.length; i++) {
        collisionCheck(i);
    }
    for (let i=0; i < circles.length; i++) {
        circles[i].click();
        circles[i].accelerate(coeffRoll);
        circles[i].move();
        circles[i].show();
    }
    if (predictionView) {
        for (let i=0; i < circles.length; i++) {
        if(!circles[i].potted){
            switch(projectionMode){
            case 1:
                if(i === 0){
                drawProjections(i);
                }
                break;
            case 2:
                if(i === 0 || i === ballNum){
                drawProjections(i);
                }
                break;
            case 3:
                drawProjections(i);
                break;
            }
        }
        }
    }
    if (directionView && !motion) {
        if (circles[0].xVelShot != 0 || circles[0].yVelShot != 0) {
        strokeWeight(3);
        stroke(0);
        line(circles[0].x, circles[0].y, circles[0].x + circles[0].xVelShot*3, circles[0].y - circles[0].yVelShot*3);
        }
    }
    cue.show();
    checkForMotion();
    if(!motion && !cue.on && circles[0].locked){
        cue.update(circles[0]);
        cue.on = true;
    }
    if(!motion && ballHit){
        ballHit = false;
    }
    if(!motion && circles[0].potted){
        circles[0].potted = false;
    }
}

/**
 * Draws the projection lines for a ball
 * @param {int} i The id of the ball
 */
function drawProjections(i){
    for (let j=1; j < circles[i].xCollisions.length; j++) {
        strokeWeight(1);
        stroke(circles[i].color);
        line(circles[i].xCollisions[j-1], circles[i].yCollisions[j-1], circles[i].xCollisions[j], circles[i].yCollisions[j]);
    }
}

/**
 * Resets the game back to its initial position
 */
function resetGame(){
    wallCoefRest = 0.5; 
    circleCoefRest = 0.9; 
    coeffRoll = 0.01; 
    projectionMode = 3;
    coordinateSystem = 1;
    predictionView = false;
    directionView = true;
    motion  = false;
    ballHit = false;
    calc = false;
    ballNum = 0;
    circles = [];
    holes = [];
    bumpers = [];
    
    // TOP LEFT bumper
    bumpers.push(new Bumper(poolTableBorder+holeRadius, poolTableBorder, // top left corner
                            poolTableX/2-holeRadius, poolTableBorder, // top right corner
                            poolTableX/2-holeRadius-bumperIndent, poolTableBorder+bumperLength, // bottom right corner
                            poolTableBorder+holeRadius+bumperIndent, poolTableBorder+bumperLength, // bottom left corner
                            1));
    // TOP RIGHT bumper
    bumpers.push(new Bumper(poolTableX/2+holeRadius, poolTableBorder, // top left corner
                            poolTableX-poolTableBorder-holeRadius, poolTableBorder, // top right corner
                            poolTableX-poolTableBorder-holeRadius-bumperIndent, poolTableBorder+bumperLength, // bottom right corner
                            poolTableX/2+holeRadius+bumperIndent, poolTableBorder+bumperLength, // bottom left corner
                            1));
    // LEFT bumper
    bumpers.push(new Bumper(poolTableBorder, poolTableBorder+holeRadius, // top left corner
                            poolTableBorder+bumperLength, poolTableBorder+holeRadius+bumperIndent, // top right corner
                            poolTableBorder+bumperLength, poolTableY-poolTableBorder-holeRadius-bumperIndent, // bottom right corner
                            poolTableBorder, poolTableY-poolTableBorder-holeRadius, // bottom left corner
                            2));
    // RIGHT bumper
    bumpers.push(new Bumper(poolTableX-poolTableBorder-bumperLength, poolTableBorder+holeRadius+bumperIndent, // top left corner
                            poolTableX-poolTableBorder, poolTableBorder+holeRadius, // top right corner
                            poolTableX-poolTableBorder, poolTableY-poolTableBorder-holeRadius, // bottom right corner
                            poolTableX-poolTableBorder-bumperLength, poolTableY-poolTableBorder-holeRadius-bumperIndent, // bottom left corner
                            3));
    // BOTTOM LEFT bumper
    bumpers.push(new Bumper(poolTableBorder+holeRadius+bumperIndent, poolTableY-poolTableBorder-bumperLength, // top left corner
                            poolTableX/2-holeRadius-bumperIndent, poolTableY-poolTableBorder-bumperLength, // top right corner
                            poolTableX/2-holeRadius, poolTableY-poolTableBorder, // bottom right corner
                            poolTableBorder+holeRadius, poolTableY-poolTableBorder, // bottom left corner
                            4));
    // BOTTOM RIGHT bumper
    bumpers.push(new Bumper(poolTableX/2+holeRadius+bumperIndent, poolTableY-poolTableBorder-bumperLength, // top left corner
                            poolTableX-poolTableBorder-holeRadius-bumperIndent, poolTableY-poolTableBorder-bumperLength, // top right corner
                            poolTableX-poolTableBorder-holeRadius, poolTableY-poolTableBorder, // bottom right corner
                            poolTableX/2+holeRadius, poolTableY-poolTableBorder, // bottom left corner
                            4));

    holes.push(new Hole(poolTableBorder + cornerHoleShift, poolTableBorder + cornerHoleShift, holeRadius));
    holes.push(new Hole(poolTableX/2, poolTableBorder - middleHoleShift, holeRadius));
    holes.push(new Hole(poolTableX - poolTableBorder - cornerHoleShift, poolTableBorder + cornerHoleShift, holeRadius));
    holes.push(new Hole(poolTableBorder + cornerHoleShift, poolTableY - poolTableBorder - cornerHoleShift, holeRadius));
    holes.push(new Hole(poolTableX/2, poolTableY - poolTableBorder + middleHoleShift, holeRadius));
    holes.push(new Hole(poolTableX - poolTableBorder - cornerHoleShift, poolTableY - poolTableBorder - cornerHoleShift, holeRadius));

    circles.push(new Circle(200, 250, 0, 0, 12.5, 10, color(255),           0)); // White
    // SOLIDS
    circles.push(new Circle(775, 262.5, 0, 0, 12.5, 10, color(255, 255, 0), 1)); // Yellow
    circles.push(new Circle(725, 237.5, 0, 0, 12.5, 10, color(0, 0, 255),   2)); // Blue
    circles.push(new Circle(750, 275, 0, 0, 12.5, 10, color(255, 0, 0),     3)); // Red
    circles.push(new Circle(725, 262.5, 0, 0, 12.5, 10, color(90, 25, 140), 4)); // Purple
    circles.push(new Circle(800, 300, 0, 0, 12.5, 10, color(255, 160, 0),   5)); // Orange
    circles.push(new Circle(775, 212.5, 0, 0, 12.5, 10, color(0, 255, 0),   6)); // Green
    circles.push(new Circle(800, 225, 0, 0, 12.5, 10, color(128, 0, 0),     7)); // Maroon
    circles.push(new Circle(750, 250, 0, 0, 12.5, 10, color(0),             8)); // Black
    // STRIPES
    circles.push(new Circle(700, 250, 0, 0, 12.5, 10, color(255, 255, 0),   9)); // Yellow
    circles.push(new Circle(775, 287.5, 0, 0, 12.5, 10, color(0, 0, 255),   10)); // Blue
    circles.push(new Circle(775, 237.5, 0, 0, 12.5, 10, color(255, 0, 0),   11)); // Red
    circles.push(new Circle(800, 200, 0, 0, 12.5, 10, color(90, 25, 140),   12)); // Purple
    circles.push(new Circle(800, 250, 0, 0, 12.5, 10, color(255, 160, 0),   13)); // Orange
    circles.push(new Circle(800, 275, 0, 0, 12.5, 10, color(0, 255, 0),     14)); // Green
    circles.push(new Circle(750, 225, 0, 0, 12.5, 10, color(128, 0, 0),     15)); // Maroon

    cue = new Cue(circles[0]);
}

/**
 * Checks if any balls are moving
 */
function checkForMotion(){
    motion = false;
    for(let i = 0; i < circles.length;i++){
        if(circles[i].xVel != 0 || circles[i].yVel != 0){
        motion = true;
        }
    }
}

/**
 * Predicts the path of all the balls after a shot
 */
function predictShot() {
    ballhit = false;
    ballNum = 0;
    predictionView = true;
    // store initial circle positions
    xInitial = [];
    yInitial = [];
    for (let i=0; i < circles.length; i++) {
        xInitial[i] = circles[i].x;
        yInitial[i] = circles[i].y;
    }
    // calculate the entire shot
    circles[0].shoot();
    for (let i=0; i < circles.length; i++) {
        circles[i].xCollisions.push(circles[i].x);
        circles[i].yCollisions.push(circles[i].y);
    }
    for (let k=0; k<10000; k++) {
        checkForMotion();
        if(!motion){break;}
        for (let i=1; i < circles.length; i++) {  
        collisionCheck(i);
        }  
        for (let i=0; i < circles.length; i++) {
        circles[i].accelerate(coeffRoll);
        circles[i].move();
        }
    }
    for (let i=0; i < circles.length; i++) {
        circles[i].xCollisions.push(circles[i].x);
        circles[i].yCollisions.push(circles[i].y);
    }
    for (let i=0; i < circles.length; i++) {
        circles[i].x = xInitial[i];
        circles[i].y = yInitial[i];
        circles[i].xVel = 0;
        circles[i].yVel = 0;
    }
}

/**
 * Checks if a ball is colliding with any other objects
 * @param {int} i the ball being checked
 */
function collisionCheck(i){
    for(let j = 0; j < holes.length;j++){
      circles[i].holeCollision(holes[j]);
    }
    for(let j = 0; j < bumpers.length;j++){
      circles[i].bumperCollision(bumpers[j],wallCoefRest);
    }
    for (let j=i+1; j < circles.length; j++) {
        if (circles[i].circleCollisionCheck(circles[j])) {
            circles[i].circleCollisionCalc(circles[j], circleCoefRest);
            if(i === 0){return 0;} else {return 1;}
        }
    }
}

/**
 * Draws border around the outside of the table 
*/ 
function drawBorder() {
    stroke(170,114,67);
    strokeWeight(2*poolTableBorder);
    line(0,0,poolTableX,0);
    line(0,poolTableY,poolTableX,poolTableY);
    line(poolTableX,0,poolTableX,poolTableY);
    line(0,0,0,poolTableY);
}

/**
   * Finds the angle based on the given x and y vectors
   * @param {float} x The x vector given
   * @param {float} y The y vector given
   * @returns {float} the angle from the postive x axis
   */ 
function findAngle(x, y) {
    if (x==0) {
      if (y > 0) {
        return PI/2;
      } else if (y < 0) {
        return 3*PI/2;
      } else {
        return 0;
      }
    }

    if (y==0) {
      if (x > 0) {
        return 0;
      } else if (x < 0) {
        return PI;
      } else {
        return 0;
      }
    }

    if (x > 0) {
      if (y > 0) {
        return Math.atan(y/x);
      } else {
        return Math.atan(y/x) + 2*PI;
      }
    } else {
      if (y > 0) {
        return Math.atan(y/x) + PI;
      } else {
        return Math.atan(y/x) + PI;
      }
    }
  }

/**
 * Deals with mouse click input
*/ 
function mousePressed() {
    if(mouseButton === LEFT){
        if(circles[0].clicked){
            circles[0].locked = true;
            stroke(0);
        } else{
            circles[0].locked = false;
        }
    } else if(mouseButton === RIGHT){
        checkForMotion();
        if(!motion){
        predictionView = false;
        ballhit = false;
        ballNum = 0;
        cue.on = false;
        cue.reset(circles[0]);
        circles[0].shoot();
        circles[0].xVelShot = 0;
        circles[0].yVelShot = 0;
        circles[0].vel = 0;
        circles[0].angle = 0;
        updateControls();
        }
    }
}

/**
 * Deals with mouse drag input
*/ 
function mouseDragged() {
    if(circles[0].locked){
        circles[0].xVelShot = (mouseX - circles[0].x) * -0.1;
        circles[0].yVelShot = (mouseY - circles[0].y) * 0.1;
        circles[0].vel = circles[0].findVelocity();
        circles[0].angle = findAngle(circles[0].xVelShot,circles[0].yVelShot);
        if(circles[0].vel > 45){
            circles[0].vel = 45;
            circles[0].xVelShot = 45*cos(circles[0].angle);
            circles[0].yVelShot = 45*sin(circles[0].angle);
            updateControls();
            cue.update(circles[0],circles[0].x + circles[0].xVelShot*(-10),circles[0].y + circles[0].yVelShot*(10));
            return;
        }
        updateControls();
        cue.update(circles[0]);
    }
}

/**
 * Deals with mouse release input
*/ 
function mouseReleased() {
    if(circles[0].locked){
        predictShot();
    }
    circles[0].locked = false;
}

//CLASSES

/**
 * Represents a pool ball
 */ 
class Circle {
    /**
     * @constructor
     * 
     * @param {float} x The x position of the ball
     * @param {float} y The y position of the ball
     * @param {float} xVel The x velocity of the ball
     * @param {float} yVel The y xelocity of the ball
     * @param {float} radius The radius of the ball
     * @param {float} mass The mass of the ball
     * @param {color} color The color of the ball
     * @param {int} number The number of the ball
     */ 
    constructor(x, y, xVel, yVel, radius = 10, mass = 1, color = color(255), number = 0) {
        this.x = x;
        this.y = y;
        this.xVel = xVel;
        this.yVel = yVel;
        this.radius = radius;
        this.diameter = radius*2;
        this.mass = mass;
        this.color = color;
        this.number = number;

        this.xVelShot = 0;
        this.yVelShot = 0;
        this.vel = 0;
        this.angle = 0;
        this.xCollisions = [];
        this.yCollisions = [];

        this.clickable = true;
        this.clicked = false;
        this.locked = false;
    }

    /**
     * Moves the ball in the required x and y direction
     */ 
    move(){
        if(this.number === 0){
            for(let i = 0; i < 10;i++){
                this.x += this.xVel*0.1;
                this.y += this.yVel*0.1;
                stop = collisionCheck(0);
                if(stop){return;}
            }
        } else {
            this.x += this.xVel;
            this.y += this.yVel;
        }
    }

    /**
     * Shows the ball on the table
     */ 
    show() {
        if(!this.potted){
            noStroke();
            if(this.locked) {
                stroke(0);
                strokeWeight(4);
            }
            fill(this.color);
            circle(this.x, this.y, this.diameter);
            if (this.number >= 9 && this.number <= 15) {
                fill(255);
                arc(this.x, this.y, this.diameter, this.diameter, PI/4, 3*PI/4, OPEN);
                arc(this.x, this.y, this.diameter, this.diameter, -3*PI/4, -PI/4, OPEN);
            }
            if(this.number === 0 && !motion && coordinateView){
                strokeWeight(1);
                stroke(0);
                line(this.x,this.y, this.x, this.y - 50)
                line(this.x,this.y,this.x + 50, this.y);
                fill(0);
                triangle(this.x,this.y -50,this.x-5,this.y -40,this.x + 5, this.y - 40);
                triangle(this.x + 50,this.y, this.x + 40,this.y + 5, this.x + 40,this.y - 5);
            }
        }
    }

    /**
     * Shoots the ball in the specified x and y direction 
     */ 
    shoot() {
        for (let i=0; i < circles.length; i++) {
            circles[i].xCollisions = [];
            circles[i].yCollisions = [];
        }
        this.xVel = parseFloat(this.xVelShot);
        this.yVel = -parseFloat(this.yVelShot);
    }
    /**
     * Resets the white ball when potted
     */ 
    resetWhite(){
        if(predictionView){
            this.x = 200;
            this.y = 250;
            this.xVel = 0;
            this.yVel = 0;
        } else {
            this.x = 200;
            this.y = 250;
            this.xVel = 0;
            this.yVel = 0;
        }
    }

    /**
     * Detects and deals with collisions with the bumper
     */ 
    bumperCollision(bumper,coefRest){
        switch(bumper.id) {
        case 1: // Top Bumpers
            if(this.y < bumper.y3 + this.radius &&  bumper.x3 >= this.x  && this.x >= bumper.x4){
                this.y = bumper.y3 + this.radius;
                this.yVel = abs(this.yVel)*coefRest;
                this.xCollisions.push(this.x);
                this.yCollisions.push(this.y);
            }
            break;
        case 2: // Left Bumper
            if(this.x < bumper.x3 + this.radius &&  bumper.y3 >= this.y && this.y >= bumper.y2){
                this.x = bumper.x3 + this.radius;
                this.xVel = abs(this.xVel)*coefRest;
                this.xCollisions.push(this.x);
                this.yCollisions.push(this.y);
            }
            break;
        case 3: // Right Bumper
            if(this.x > bumper.x1 - this.radius &&  bumper.y4 >= this.y  && this.y >= bumper.y1){
                this.x = bumper.x1 - this.radius;
                this.xVel = -abs(this.xVel)*coefRest;
                this.xCollisions.push(this.x);
                this.yCollisions.push(this.y);
            }
            break;
        case 4: // Bottom Bumpers
            if(this.y > bumper.y1 - this.radius &&  bumper.x2 >= this.x && this.x >= bumper.x1){
                this.y = bumper.y1 - this.radius;
                this.yVel = -abs(this.yVel)*coefRest;
                this.xCollisions.push(this.x);
                this.yCollisions.push(this.y);
            }
            break;
        }
    }

    /**
     * Detects and deals with collisions with the hole
     */ 
    holeCollision(hole){
        if(dist(this.x,this.y,hole.x,hole.y) < hole.radius + 3){
            this.xCollisions.push(this.x);
            this.yCollisions.push(this.y);
            this.x = hole.x;
            this.y = hole.y;
            this.xVel = 0;
            this.yvel = 0;
            if(!predictionView){
                if(this.number === 0){
                this.resetWhite(hole);
            }
                this.potted = true;
            }
        }
    }

    /**
     * Detects collisions with other balls
     */ 
    circleCollisionCheck(otherCircle) {
        if(this.potted || otherCircle.potted){return;}
        return dist(this.x, this.y, otherCircle.x, otherCircle.y) < (this.radius + otherCircle.radius);
    }

    /**
     * Deals with collisions with the bumper and updates FBD and calculations
     */ 
    circleCollisionCalc(otherCircle, coefRest = 1) {
        this.xCollisions.push(this.x);
        this.yCollisions.push(this.y);
        otherCircle.xCollisions.push(otherCircle.x);
        otherCircle.yCollisions.push(otherCircle.y);

        let mt = this.mass;
        let mo = otherCircle.mass;
        let dx = otherCircle.x - this.x;
        let dy = otherCircle.y - this.y;
        let vtxi = this.xVel;
        let vtyi = this.yVel;
        let voxi = otherCircle.xVel;
        let voyi = otherCircle.yVel;

        // finding angles and initial velocities
        let vt = Math.sqrt(this.xVel * this.xVel + this.yVel * this.yVel);
        let vo = Math.sqrt(otherCircle.xVel * otherCircle.xVel + otherCircle.yVel * otherCircle.yVel);
        let at = findAngle(this.xVel, this.yVel);
        let ao = findAngle(otherCircle.xVel, otherCircle.yVel);
        let phi = findAngle(dx, dy);

        // finding initial velocities on new coordinate system
        let vtx = vt*Math.cos(at-phi);
        let vty = vt*Math.sin(at-phi);
        let vox = vo*Math.cos(ao-phi);
        let voy = vo*Math.sin(ao-phi);

        // finding final velocities on new coordinate system
        let vtfx = (mt*vtx + mo*vox + mo*coefRest*(vox-vtx))/(mt+mo);
        let vofx = (mt*vtx + mo*vox + mt*coefRest*(vtx-vox))/(mt+mo);
        let vtfy = vty;
        let vofy = voy;

        // converting final velocities to regular coordinate system and replacing them
        this.xVel = Math.cos(phi)*vtfx + Math.cos(phi+PI/2)*vtfy;
        this.yVel = Math.sin(phi)*vtfx + Math.sin(phi+PI/2)*vtfy;
        otherCircle.xVel = Math.cos(phi)*vofx + Math.cos(phi+PI/2)*vofy;
        otherCircle.yVel = Math.sin(phi)*vofx + Math.sin(phi+PI/2)*vofy;

        // This adjusts the positions of the circles so they remain outside one another. The circles may stick together if they overlap.
        let halfOverlap = 0.51*abs(dist(this.x, this.y, otherCircle.x, otherCircle.y) - (this.radius + otherCircle.radius));
        this.x += halfOverlap * -Math.cos(phi);
        this.y += halfOverlap * -Math.sin(phi);
        otherCircle.x += halfOverlap * Math.cos(phi);
        otherCircle.y += halfOverlap * Math.sin(phi);

        if(predictionView && this.number === 0 && !ballHit && ballNum === 0){
            ballHit = true;
            ballNum = otherCircle.number;
            otherball.on = true;
            calc = true;
            otherball.x = (otherCircle.x - this.x)*3.7 + whiteball.x
            otherball.y = (otherCircle.y - this.y)*3.7 + whiteball.y
            otherball.v0.x = (otherCircle.x - this.x)*3.7 + whiteball.x
            otherball.v0.y = (otherCircle.y - this.y)*3.7 + whiteball.y
            otherball.color = otherCircle.color;
            otherball.id = otherCircle.number;
            updateCalculations(mt,mo,dx,dy,vtxi,vtyi,voxi,voyi,vt,vo,at,ao,phi,vtx,vty,vox,voy,vtfx,vtfy,vofx,vofy,this.xVel,this.yVel,otherCircle.xVel,otherCircle.yVel);
            updateEquations();
            whiteball.updateVectors(vtxi,vtyi,this.xVel,this.yVel);
            otherball.updateVectors(voxi,voyi,otherCircle.xVel,otherCircle.yVel);
        }
    }

    /**
     * Finds the overall velocity based on the specified x and y velocities 
     * @returns {float} Velocity of the ball
     */ 
    findVelocity(){
        return(abs(Math.sqrt(this.xVelShot*this.xVelShot+this.yVelShot*this.yVelShot)));
    }


    /**
     * Acts as the friction between the ball and the table cloth
     */ 
    accelerate(coeff) {

        let acceleration = -coeff;
        let theta = findAngle(this.xVel, this.yVel);

        if (this.xVel != 0) {
            let initSignX = Math.sign(this.xVel);
            this.xVel += acceleration*Math.cos(theta);
            if (initSignX != Math.sign(this.xVel)) {
                this.xVel = 0;
            }
        }

        if (this.yVel != 0) {
            let initSignY = Math.sign(this.yVel);
            this.yVel += acceleration*Math.sin(theta);
            if (initSignY != Math.sign(this.yVel)) {
                this.yVel = 0;
            }
        }
    }

    /**
     * Detects if the ball is clicked
     */ 
    click() {
        if (dist(mouseX, mouseY, this.x, this.y) < this.radius && this.clickable) {
            this.clicked = true;
        } else {
            this.clicked = false;
        }
    }
}

/**
 * Represents a Cue object
 */
class Cue{
    /**
     * @constructor
     * @param {Circle} ball The ball which the cue is for
     */
    constructor(ball){
        this.x1 = ball.x
        this.y1 = ball.y
        this.x2 = ball.x
        this.y2 = ball.y
        this.on = true
    }

    /**
     * Updates the cue
     * @param {Circle} ball The ball which the cue is for
     */
    update(ball,x = mouseX, y = mouseY){
        this.x1 = ball.x;
        this.x2 = x;
        this.y1 = ball.y;
        this.y2 = y;
    }

    /**
     * Resets the cue
     * @param {Circle} ball The ball which the cue is for
     */
    reset(ball){
        this.x2 = ball.x;
        this.y2 = ball.y;
    }

    /**
     * Shows the cue
     */
    show(){
        if(this.on){
        stroke(0);
        strokeWeight(5);
        line(this.x1,this.y1,this.x2,this.y2)
        }
    }
}


/**
 * Represents a Hole object
 */
class Hole {
    /**
     * @constructor
     * @param {float} x      X position of the hole
     * @param {float} y      Y position of the hole
     * @param {float} radius Radius of the hole
     */
    constructor(x, y, radius = 15) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.diameter = radius*2;
    }

    /**
     * Shows the hole
     */
    show() {
        fill(0);
        noStroke();
        circle(this.x, this.y, this.diameter);
    }
}

/**
 * Represents a bumper object
 */
class Bumper {
    /**
     * @constructor
     * @param {float} x1 X value of top left corner
     * @param {float} y1 Y value of top left corner
     * @param {float} x2 X value of top right corner
     * @param {float} y2 Y value of top right corner
     * @param {float} x3 X value of bottom right corner
     * @param {float} y3 Y value of bottom right corner
     * @param {float} x4 X value of bottom left corner
     * @param {float} y4 Y value of bottom left corner
     * @param {int} id ID of the bumper
     */
    constructor(x1, y1, x2, y2, x3, y3, x4, y4, id) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.x3 = x3;
        this.y3 = y3;
        this.x4 = x4;
        this.y4 = y4;
        this.id = id;
    }

    /**
     * Shows the bumper
     */
    show(){
        noStroke();
        fill(11, 130, 90);
        quad(this.x1, this.y1, this.x2, this.y2, this.x3, this.y3, this.x4, this.y4);
    }
}

