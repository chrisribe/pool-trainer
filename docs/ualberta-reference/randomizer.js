
ImageArray = new Array();
ImageArray[0] = 'Loops_2_60.gif';
ImageArray[1] = 'Mec_E_250_banner_alt.gif';
ImageArray[2] = 'Ramp_Spikes.gif';
ImageArray[3] = 'Tube_Final.gif';
ImageArray[4] = 'Waves.gif';
ImageArray[5] = 'Impact_1500.gif';


function getRandomImage() {
    var num = Math.floor( Math.random() *6);
    var img = 'url("banners/' + ImageArray[num] + '")scroll no-repeat center';
    document.getElementById("main_part_inner").style.background = img;
}