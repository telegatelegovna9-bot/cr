[Sitemap](https://medium.com/sitemap/sitemap.xml)

[Open in app](https://play.google.com/store/apps/details?id=com.medium.reader&referrer=utm_source%3DmobileNavBar&source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2Fbetter-programming%2Fhow-to-create-interactive-candlestick-charts-with-real-time-bitcoin-data-in-javascript-fb20166b4fe0&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

[Medium Logo](https://medium.com/?source=post_page---top_nav_layout_nav-----------------------------------------)

Get app

[Write](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fnew-story&source=---top_nav_layout_nav-----------------------new_post_topnav------------------)

[Search](https://medium.com/search?source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2Fbetter-programming%2Fhow-to-create-interactive-candlestick-charts-with-real-time-bitcoin-data-in-javascript-fb20166b4fe0&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

![Unknown user](https://miro.medium.com/v2/resize:fill:32:32/1*dmbNkD5D-u45r44go_cf0g.png)

[**Better Programming**](https://medium.com/better-programming?source=post_page---publication_nav-d0b105d10f0a-fb20166b4fe0---------------------------------------)

·

Follow publication

[![Better Programming](https://miro.medium.com/v2/resize:fill:38:38/1*QNoA3XlXLHz22zQazc0syg.png)](https://medium.com/better-programming?source=post_page---post_publication_sidebar-d0b105d10f0a-fb20166b4fe0---------------------------------------)

Advice for programmers.

Follow publication

Member-only story

# How to Create Interactive Candlestick Charts With Real-Time Bitcoin Data in JavaScript

## Use the Binance API to stream real-time cryptocurrency prices

[![Christian Behler](https://miro.medium.com/v2/resize:fill:32:32/1*N2e2n5-SlUpgcMUUIej6_A.png)](https://medium.com/@pingpoli?source=post_page---byline--fb20166b4fe0---------------------------------------)

[Christian Behler](https://medium.com/@pingpoli?source=post_page---byline--fb20166b4fe0---------------------------------------)

Follow

5 min read

·

Aug 9, 2021

167

4

[Listen](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2Fplans%3Fdimension%3Dpost_audio_button%26postId%3Dfb20166b4fe0&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fbetter-programming%2Fhow-to-create-interactive-candlestick-charts-with-real-time-bitcoin-data-in-javascript-fb20166b4fe0&source=---header_actions--fb20166b4fe0---------------------post_audio_button------------------)

Share

Press enter or click to view image in full size

![An image of a candlestick chart with red and green candlesticks that show an upwards trend in the Bitcoin price.](https://miro.medium.com/v2/resize:fit:700/1*s8EgntSlYEbaJ1d9lJTADQ.png)

An interactive candlestick chart with real-time bitcoin data, image by author.

With the [GameStop short squeeze](https://www.cnbc.com/2021/01/22/gamestop-soars-nearly-70percent-trading-briefly-halted-amid-epic-short-squeeze.html) and [Bitcoin’s price records](https://www.cnbc.com/2021/03/13/bitcoin-surpasses-60000-in-record-high-as-rally-accelerates-.html) earlier this year, candlestick diagrams were all over the news and I realized that I had no idea how to read them. So a few weeks ago, I finally read up on them and learned that they are actually quite easy to understand.

One of my favorite things to do whenever I learn about a new topic is creating my own custom tools for it. Programming something yourself is one of the best ways to get a solid understanding of any topic. Therefore, [I created a simple JavaScript class to plot candlestick charts on an HTML canvas](https://levelup.gitconnected.com/creating-candlestick-charts-in-javascript-116ea2d6f7dd).

However, my first solution was only able to draw static diagrams and had no interactivity, so there was no way to use it for displaying real-time price data. To remedy this situation, I put some more work into it, added zooming and technical indicators, and connected it to a real-time WebSocket candlestick stream via the [Binance API](https://binance-docs.github.io/apidocs/spot/en/#introduction).

## Updating the Candlestick Chart Class

Before displaying any real-time data, I had to add support for it to my candlestick chart class.

Previously, it only supported static candlestick values and had no way to update them dynamically. Therefore, I added a new `updateCandlestick( candlestickID , open , close , high, low )` function that updates the values of a given candlestick.

The next step was implementing the ability to zoom in and out of the chart. It’s a very important feature if you actually want to use a candlestick chart productively.

You are probably looking at it quite zoomed in, but when you have to decide whether to buy or sell an asset, you might zoom out to look at the development of the prices over a longer period. Luckily, adding zooming turned out to be quite easy by just changing the starting index of the candlesticks that are drawn. E.g. start at index 0 to draw all candlesticks, and if you only want to draw the last 100, start at `candlesticks.length-100`.

Finally, I added support for technical indicators to the candlestick chart class. I…

## Create an account to read the full story.

The author made this story available to Medium members only.

If you’re new to Medium, create a new account to read this story on us.

[Continue in app](https://play.google.com/store/apps/details?id=com.medium.reader&referrer=utm_source%3Dregwall&source=-----fb20166b4fe0---------------------post_regwall------------------)

Or, continue in mobile web

[Sign up with Google](https://medium.com/m/connect/google?state=google-%7Chttps%3A%2F%2Fmedium.com%2Fbetter-programming%2Fhow-to-create-interactive-candlestick-charts-with-real-time-bitcoin-data-in-javascript-fb20166b4fe0%3Fsource%3D-----fb20166b4fe0---------------------post_regwall------------------%26skipOnboarding%3D1%7Cregister%7Cremember_me&source=-----fb20166b4fe0---------------------post_regwall------------------)

[Sign up with Facebook](https://medium.com/m/connect/facebook?state=facebook-%7Chttps%3A%2F%2Fmedium.com%2Fbetter-programming%2Fhow-to-create-interactive-candlestick-charts-with-real-time-bitcoin-data-in-javascript-fb20166b4fe0%3Fsource%3D-----fb20166b4fe0---------------------post_regwall------------------%26skipOnboarding%3D1%7Cregister%7Cremember_me&source=-----fb20166b4fe0---------------------post_regwall------------------)

Sign up with email

Already have an account? [Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2Fbetter-programming%2Fhow-to-create-interactive-candlestick-charts-with-real-time-bitcoin-data-in-javascript-fb20166b4fe0&source=-----fb20166b4fe0---------------------post_regwall------------------)

167

167

4

[![Better Programming](https://miro.medium.com/v2/resize:fill:48:48/1*QNoA3XlXLHz22zQazc0syg.png)](https://medium.com/better-programming?source=post_page---post_publication_info--fb20166b4fe0---------------------------------------)

[![Better Programming](https://miro.medium.com/v2/resize:fill:64:64/1*QNoA3XlXLHz22zQazc0syg.png)](https://medium.com/better-programming?source=post_page---post_publication_info--fb20166b4fe0---------------------------------------)

Follow

[**Published in Better Programming**](https://medium.com/better-programming?source=post_page---post_publication_info--fb20166b4fe0---------------------------------------)

[224K followers](https://medium.com/better-programming/followers?source=post_page---post_publication_info--fb20166b4fe0---------------------------------------)

· [Last published Nov 10, 2023](https://medium.com/better-programming/let-a-thousand-programming-publications-bloom-bf37baef8f27?source=post_page---post_publication_info--fb20166b4fe0---------------------------------------)

Advice for programmers.

Follow

[![Christian Behler](https://miro.medium.com/v2/resize:fill:48:48/1*N2e2n5-SlUpgcMUUIej6_A.png)](https://medium.com/@pingpoli?source=post_page---post_author_info--fb20166b4fe0---------------------------------------)

[![Christian Behler](https://miro.medium.com/v2/resize:fill:64:64/1*N2e2n5-SlUpgcMUUIej6_A.png)](https://medium.com/@pingpoli?source=post_page---post_author_info--fb20166b4fe0---------------------------------------)

Follow

[**Written by Christian Behler**](https://medium.com/@pingpoli?source=post_page---post_author_info--fb20166b4fe0---------------------------------------)

[419 followers](https://medium.com/@pingpoli/followers?source=post_page---post_author_info--fb20166b4fe0---------------------------------------)

· [8 following](https://medium.com/@pingpoli/following?source=post_page---post_author_info--fb20166b4fe0---------------------------------------)

M. Sc. Computer Science and Physics, Indie Game/Software/Web Developer, Writer, 3D Artist, and too many other interests. [https://pingpoli.medium.com/membership](https://pingpoli.medium.com/membership)

Follow

[Help](https://help.medium.com/hc/en-us?source=post_page-----fb20166b4fe0---------------------------------------)

[Status](https://status.medium.com/?source=post_page-----fb20166b4fe0---------------------------------------)

[About](https://medium.com/about?autoplay=1&source=post_page-----fb20166b4fe0---------------------------------------)

[Careers](https://medium.com/jobs-at-medium/work-at-medium-959d1a85284e?source=post_page-----fb20166b4fe0---------------------------------------)

[Press](mailto:pressinquiries@medium.com)

[Blog](https://blog.medium.com/?source=post_page-----fb20166b4fe0---------------------------------------)

[Privacy](https://policy.medium.com/medium-privacy-policy-f03bf92035c9?source=post_page-----fb20166b4fe0---------------------------------------)

[Rules](https://policy.medium.com/medium-rules-30e5502c4eb4?source=post_page-----fb20166b4fe0---------------------------------------)

[Terms](https://policy.medium.com/medium-terms-of-service-9db0094a1e0f?source=post_page-----fb20166b4fe0---------------------------------------)

[Text to speech](https://speechify.com/medium?source=post_page-----fb20166b4fe0---------------------------------------)

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**