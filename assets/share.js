
window.onload = () => {
  const setShareLinks = () => {
      const shareLinks = document.querySelectorAll(".social-sharing__link");
      shareLinks.forEach(el => {
          el.addEventListener("click", event => {
              event.preventDefault();
              const url = el.getAttribute("href");
              socialWindow(url);
          });
      });
  };

  const socialWindow = (url) => {
      const left = (screen.width - 570) / 2;
      const top = (screen.height - 570) / 2;
      const params = `menubar=no,toolbar=no,status=no,width=570,height=570,top=${top},left=${left}`;
      window.open(url, "NewWindow", params);
  };
  setShareLinks();
};
