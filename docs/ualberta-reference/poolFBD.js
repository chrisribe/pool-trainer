let width = 310, length = 310;

/**
 * Main function
 * @param {p5} p Instance of p5
 */
let sim = function(p) {
    p.setup = function() {
        p.createCanvas(length, width);
        reset(p);

    };
    p.draw = function() {
        p.background(255);
        otherball.show(p);
        whiteball.show(p);
        axes.show(p);
    };
}
 
let myp5 = new p5(sim, 'container1');

/**
 * Represents an axes object
 * @param {p5} p instance of p5
 * @param {float} l length of the canvas
 * @param {float} w width of the canvas
 */
let Axis = function(p,l,w){
    this.p = p;
    this.l = l;
    this.w = w;
}

/**
 * Draws the axes
 * @param {p5} p instance of p5
 */
Axis.prototype.show = function(p){
    p.stroke(0);
    p.strokeWeight(0.5);
    p.line(this.l/2,0,this.l/2,this.w);
    p.line(0,this.w/2,this.l,this.w/2);
    p.fill(0);
    p.triangle(this.l/2,0,this.l/2+this.l/30,this.w/30,this.l/2-this.l/30,this.w/30);
    p.triangle(this.l,this.w/2,this.l-this.l/30,this.w/2-this.w/30,this.l-this.l/30,this.w/2+this.w/30);
    p.textStyle(ITALIC);
    p.textFont('STIX');
    p.textSize(20);
    p.text('x',this.l-10,this.w/2-10)
    p.text('y',this.l/2+10,10);
}

/**
 * Represents a ball
 * @param {p5} p Instance of p5
 * @param {float} x x Position of the ball
 * @param {float} y y position of the ball
 * @param {float} r radius of the ball
 * @param {color} color color of the ball 
 * @param {int} id id of the ball
 * @param {boolean} show 
 */
let Ball =  function(p,x,y,r,color,id,show){
    this.p = p;
    this.x = x;
    this.y = y;
    this.rad = r;
    this.v0 = createVector(this.x,this.y);
    this.v1 = createVector(this.x,this.y);
    this.v2 = createVector(0,0);
    this.v3 = createVector(0,0);
    this.color = color;
    this.textcolor = 'black';
    this.id = id;
    this.on = show;
}

/**
 * Draws the ball and its vectors
 * @param {p5} p instance of p5
 */
Ball.prototype.show = function(p) {
    if(this.on){
        p.fill(255);
        p.strokeWeight(2);
        p.stroke(this.color);
        p.ellipse(this.x,this.y,this.rad);
        if(this.id > 8 && this.id < 16){
            p.fill(255);
            p.arc(this.x, this.y, this.rad, this.rad, PI/4, 3*PI/4, OPEN);
            p.arc(this.x, this.y, this.rad, this.rad, -3*PI/4, -PI/4, OPEN);
        }
        p.strokeWeight(2);
        p.stroke(0);
        p.fill(0);
        if(calc){
        if(this.v0 != this.v1 && this.id === 0){
            this.scaleArrows(1);
            drawArrow(p,this.v1,this.v3,color(0),this.id);
            p.textFont('STIX');
            p.textStyle(ITALIC);
            p.textSize(25);
            p.noStroke();
            p.fill(this.textcolor);
            let vec = findTextLocation1(this.v1,this.v3);
            p.text("v", vec.x,vec.y);
            p.textSize(11);
            p.text("i", vec.x+11,vec.y);

        }
        if(this.v0 != this.v2){
            this.scaleArrows(2);
            drawArrow(p,this.v0,this.v2,color(0),this.id);
            p.textFont('STIX');
            p.textStyle(ITALIC);
            p.textSize(25);
            p.noStroke();
            p.fill(this.textcolor);
            let vec1 = findTextLocation2(this.v0,this.v2);
            p.text("v", vec1.x,vec1.y);
            p.textSize(11);
            p.text("f", vec1.x + 11,vec1.y);
        }
        if(this.id === 0){
            angle = findAngle(this.v2.x,-this.v2.y);
            p.textSize(18);
            p.noStroke();
            p.textStyle(NORMAL);
            p.fill(this.textcolor);
            if(this.v2.x > 0 && -this.v2.y < this.v2.x){
                p.text('θ  = ' + thetaf + "°",length/2 + 20,width/2+15);
                p.textSize(11);
                p.text('f',length/2 + 30,width/2+15);
            } else {
                p.text('θ  = ' + thetaf + "°",length/2 + 20,width/2);
                p.textSize(11);
                p.text('f',length/2 + 30,width/2);
            }
            p.noFill();
            p.stroke(0);
            p.arc(width/2,length/2,30,30,TWO_PI - angle,TWO_PI);
        }
        }
    }
}

/**
 * Scales the arrows to fit the canvas
 * @param {int} mode deteremines which arrow to scale
 */
Ball.prototype.scaleArrows = function(mode){
    if(this.id === 0){
        arrowLength = 80;
    } else {
        arrowLength = 40;
    }
    if(mode === 1){
        let ang = findAngle(this.v3.x,this.v3.y);
        this.v3.x = arrowLength*Math.cos(ang);
        this.v3.y = arrowLength*Math.sin(ang);
        this.v1.x = width/2 - this.v3.x;
        this.v1.y = length/2 - this.v3.y;
        
    } else if(mode === 2){
        let ang = findAngle(this.v2.x,this.v2.y);
        this.v2.x = arrowLength*Math.cos(ang);
        this.v2.y = arrowLength*Math.sin(ang);
    }
}

/**
 * Updates the velocity vectors for the balls
 * @param {float} xVel1 x Velocity of the white ball
 * @param {float} yVel1 y Velocity of the white ball
 * @param {float} xVel2 x Velocity of the other ball
 * @param {float} yVel2 y Velocity of the white ball
 */
Ball.prototype.updateVectors = function(xVel1,yVel1,xVel2,yVel2){
    this.v1.x = this.x- xVel1*10;
    this.v1.y = this.x- yVel1*10;
    this.v2.x = xVel2*10;
    this.v2.y = yVel2*10;
    this.v3.x = xVel1*10;
    this.v3.y = yVel1*10;
}

/**
 * Find the best text location for vi
 * @param {vector} base The base of the arrow
 * @param {vector} vec The direction of the arrow
 */
findTextLocation1 = function(base,vec) {  
    let x,y;
      if (vec.x > 0) {
        if (vec.y > 0) {
            x = base.x - 22;
            y = base.y;
            return{x,y};
        } else {
            x = base.x - 22;
            y = base.y + 10;
            return{x,y};
        }
      } else {
        if (vec.y > 0) {
            x = base.x + 5;
            y = base.y;
            return{x,y};
        } else {
            x = base.x + 5;
            y = base.y + 10;
            return{x,y};
        }
      }
}

/**
 * Find the best text location for vf
 * @param {vector} base The base of the arrow
 * @param {vector} vec The direction of the arrow
 */
findTextLocation2 = function(base,vec) {  
    let x,y;

      if (vec.x > 0) {
        if (vec.y > 0) {
            x = base.x + vec.x + 7;
            y = base.y + vec.y + 10;
            return{x,y};
        } else {
            x = base.x + vec.x + 7;
            y = base.y + vec.y;
            return{x,y};
        }
      } else {
        if (vec.y > 0) {
            x = base.x + vec.x - 22;
            y = base.y + vec.y + 10;
            return{x,y};
        } else {
            x = base.x + vec.x - 22;
            y = base.y + vec.y;
            return{x,y};
        }
      }
}

/**
 * Resets the program
 * @param {p5} p Instance of p5
 */
reset = function(p){
    axes = new Axis(p,length,width);
    whiteball = new Ball(p,length/2,width/2,length*0.3,color(0),0,true);
    otherball = new Ball(p,length/2,width/2,length*0.3,color(0),0,false);
}

/**
 * Draws an arrow from a given base
 * @param {p5} p Instance of p5
 * @param {vector} base The base of the arrow
 * @param {vector} vec The direction of the arrow
 * @param {vector} color The color of the arrow
 */
drawArrow = function(p,base,vec,color){
    color = 'black';
    p.push();
    p.stroke(color);
    p.strokeWeight(3);
    p.fill(color);
    p.translate(base.x,base.y);
    p.line(0, 0, vec.x, vec.y);
    p.rotate(vec.heading());
    let arrowSize = 7;
    p.translate(vec.mag() - arrowSize, 0);
    p.triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);
    p.pop();
}
