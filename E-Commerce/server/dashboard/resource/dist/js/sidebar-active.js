jQuery(function() {
  let href = window.location.href;
  if (href[href.length - 1] !== '/') href += '/';
  $('a').each((index, element) => {
    if (element.href === href) {
      $(element).addClass('active');
      const ul = $(element).parents('ul .has-treeview');
      ul.addClass('menu-open');
      $(ul).children('a').addClass('active');
    }
  })
})