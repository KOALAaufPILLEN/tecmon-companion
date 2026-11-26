using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

class DesktopMotionSelfTest {
  static void Require(bool value,string message){if(!value)throw new Exception(message);}
  static void Set(DesktopPet pet,string field,object value){typeof(DesktopPet).GetField(field,BindingFlags.Instance|BindingFlags.NonPublic).SetValue(pet,value);}
  static object Get(DesktopPet pet,string field){return typeof(DesktopPet).GetField(field,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(pet);}
  static void Call(DesktopPet pet,string method,params object[] values){typeof(DesktopPet).GetMethod(method,BindingFlags.Instance|BindingFlags.NonPublic).Invoke(pet,values);}
  static double Target(DesktopPet pet,double now){return (double)typeof(DesktopPet).GetMethod("Target",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(pet,new object[]{now});}
  static bool Same(Bitmap a,Bitmap b){if(a.Size!=b.Size)return false;for(int y=0;y<a.Height;y++)for(int x=0;x<a.Width;x++)if(a.GetPixel(x,y)!=b.GetPixel(x,y))return false;return true;}
  public static int Main(string[] args){
    var size=new Size(214,160);
    foreach(var area in new[]{new Rectangle(0,0,1920,1040),new Rectangle(-1920,-400,1920,1040),new Rectangle(0,0,800,560)}){
      var route=DesktopMotion.Route(area,size);
      double length=2.0*(route.Width+route.Height);
      for(int i=0;i<10000;i++){
        var p=DesktopMotion.Along(i*length/9999,route);
        Require(p.X==route.Left||p.X==route.Right||p.Y==route.Top||p.Y==route.Bottom,"Randflug betritt die Mitte");
        Require(area.Contains(new Rectangle(p,size)),"Randflug verlässt den Monitor");
        var roundTrip=DesktopMotion.Along(DesktopMotion.Distance(p,route),route);
        Require(p==roundTrip,"Richtung springt an einer Ecke");
      }
      var center=new Point(area.Left+area.Width/2,area.Top+area.Height/2);
      var edge=DesktopMotion.Edge(center,route);
      Require(edge.X==route.Left||edge.X==route.Right||edge.Y==route.Top||edge.Y==route.Bottom,"Andocken fehlt");
    }
    var work=new Rectangle(0,0,1920,1040);
    var anchor=new Rectangle(1650,780,214,160);
    var settings=new Rectangle(1100,340,520,640);
    var quick=new Rectangle(760,300,320,700);
    var bubbleSize=new Size(390,180);
    var spot=DesktopMotion.BubbleSpot(anchor,work,bubbleSize,new[]{settings,quick});
    var bubble=new Rectangle(spot,bubbleSize);
    Require(work.Contains(bubble),"Sprechblase wird abgeschnitten");
    Require(!bubble.IntersectsWith(settings)&&!bubble.IntersectsWith(quick),"Menü verdeckt die Sprechblase");
    Require(DesktopMotion.Along(42,new Rectangle(0,0,0,0))==Point.Empty,"Kleiner Monitor");
    using(var panel=new DesktopPanel()){
      panel.ToggleCockpit();var area=Screen.FromRectangle(panel.Bounds).WorkingArea;
      Require(area.Contains(panel.Bounds),"Großes Cockpit verlässt den Monitor");
      Require(panel.ClientSize.Width==Math.Min(980,area.Width),"Cockpit-Größe fehlt");
      panel.ToggleCockpit();Require(panel.ClientSize.Width==Math.Min(520,area.Width),"Kompaktes Menü kehrt nicht zurück");
    }
    using(var pet=new DesktopPet(true)){
      Require(pet.HasModel&&pet.LoadFigureNow(),"Metall-Ressourcen fehlen");
      Set(pet,"happyUntil",0.0);Set(pet,"hover",false);Set(pet,"watching",false);
      Set(pet,"vx",1.0);Require(Target(pet,1000)==45&&Target(pet,1007)==45,"Rechtsflug schaut zeitabhängig in falsche Richtung");
      Set(pet,"vx",-1.0);Require(Target(pet,1000)==-45&&Target(pet,1007)==-45,"Linksflug schaut zeitabhängig in falsche Richtung");
      Set(pet,"vx",0.0);Require(Target(pet,1000)==0,"Vertikalflug kippt nach links");
      Set(pet,"dragging",true);Call(pet,"ReleaseDrag");
      Require(!(bool)Get(pet,"dragging")&&!pet.Capture,"Loslassen hält Mausfang fest");
      Require((double)Get(pet,"releaseUntil")>0&&((double)Get(pet,"flightDistance"))<0,"Nach Verschieben fehlt freie Andockphase");
      Set(pet,"animate",false);
      using(var preferred=pet.Preview(32.5,-1)){
        Call(pet,"SetGameSession",true);
        Require((bool)Get(pet,"highQuality"),"Sparmodus überschreibt die bevorzugte Darstellung");
        Require(((Timer)Get(pet,"animation")).Interval==50,"Sparmodus läuft nicht mit 20 Takten/s");
        using(var automatic=pet.Preview(32.5,-1)){
          Set(pet,"highQuality",false);Call(pet,"SetGameSession",false);
          using(var manual=pet.Preview(32.5,-1))Require(Same(automatic,manual),"Automatischer Sparmodus verwendet nicht die sparsame Darstellung");
          Require(!Same(preferred,automatic),"Kein tatsächlicher Darstellungswechsel");
        }
        Set(pet,"highQuality",true);Call(pet,"SetGameSession",false);
        using(var restored=pet.Preview(32.5,-1))Require(Same(preferred,restored),"3D-Darstellung nach Spielende verändert");
      }
      Call(pet,"SetGameSession",true);Set(pet,"watching",true);Call(pet,"Transformation",1000.0);
      Require((int)Get(pet,"transformStage")==1&&Get(pet,"tip")==null,"Verwandlung spricht in einer aktiven Runde");
      Set(pet,"watching",false);Set(pet,"gameForeground",true);Set(pet,"safeGameMoment",false);Call(pet,"Transformation",1000.0);
      Require(Get(pet,"tip")==null,"Verwandlung spricht ohne verlässliche Spielphase");
      Call(pet,"SetGameSession",false);
      var original=pet.Location;Call(pet,"SetMotion","still");Require(pet.Location==original,"Stillstand verändert den Platz");
      using(var menu=pet.BuildQuick(Point.Empty)){menu.Fit();Require(menu.Height<=720,"Schnellmenü ist für kleine Bildschirme zu hoch");}
    }
    if(args.Length>0)File.WriteAllText(args[0],"30.000 Randpositionen, negative Monitore, Ecken, freie Sprechblasen, echter Sparmodus-Renderwechsel/Rückkehr, 20 Takte/s und stille Verwandlung während aktiver Runde geprüft.");
    return 0;
  }
}
