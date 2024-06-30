jQuery(function() {
  $('a').each((index, element) => {
    if (element.href === window.location.href)
      element.classList.add('active');
  })
})

function handleSearchByPriceRange() {
  const value = document.getElementsByClassName("tooltip-inner")[0].innerText.split(":");
  window.location.href = '/products/search-price/' + parseInt(value[0]) + '-' + parseInt(value[1]);
}

function handleSearchProduct() {
  let searchContent = document.getElementById("searchInput").value;
  if (searchContent == "")
    searchContent = ":all"
  window.location.href = '/products/search/' + searchContent;
}